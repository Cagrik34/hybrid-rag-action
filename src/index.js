/**
 * Hybrid RAG GitHub Action Orchestrator Entry Point.
 *
 * Inference is performed exclusively via GitHub Models, authenticated with
 * the repository's GitHub-provided token (github-token input).
 */

const core = require('@actions/core');
const { DocumentChunker } = require('./core/chunker');
const { BM25Index } = require('./core/bm25');
const { FeatureVectorIndex, DenseVectorIndex } = require('./core/vector');
const { ReciprocalRankFusion } = require('./core/rrf');
const { collectDocuments } = require('./core/discovery');
const { LLMClient } = require('./integrations/llm');
const { GitHubAdapter } = require('./integrations/github');

/**
 * Strict integer parser rejecting decimals, trailing characters, negatives, and non-numeric strings.
 * @param {string|number} value
 * @param {string} name Parameter name for error reporting
 * @param {number} min Minimum allowed inclusive value
 * @param {number} max Maximum allowed inclusive value
 * @returns {number}
 */
function parseStrictInteger(value, name, min, max) {
  const str = String(value ?? '').trim();
  if (!/^\d+$/.test(str)) {
    throw new RangeError(`Invalid ${name} value "${value}": must be a strictly positive integer between ${min} and ${max}.`);
  }
  const num = Number(str);
  if (!Number.isSafeInteger(num) || num < min || num > max) {
    throw new RangeError(`Invalid ${name} value "${value}": must be an integer between ${min} and ${max}.`);
  }
  return num;
}

async function run() {
  try {
    core.info('🚀 Initializing Hybrid RAG Action...');

    const token = core.getInput('github-token') || process.env.GITHUB_TOKEN || '';
    const docsPathInput = core.getInput('docs-path') || 'README.md,action.yml,docs,CONTRIBUTING.md';
    const triggerKeyword = core.getInput('query-trigger') || 'auto';
    const modelName = core.getInput('model-name') || 'Phi-4';

    // Strict validation for top-k and rrf-k
    const topK = parseStrictInteger(core.getInput('top-k') || '5', 'top-k', 1, 100);
    const rrfK = parseStrictInteger(core.getInput('rrf-k') || '60', 'rrf-k', 1, 1000);

    const gh = new GitHubAdapter(token);
    const event = gh.getEventData();

    if (event.eventType === 'unsupported') {
      core.info(`Unsupported GitHub event trigger ("${gh.context.eventName || 'unknown'}"). Skipping.`);
      core.setOutput('retrieved-chunks-count', 0);
      core.setOutput('response-status', 'skipped');
      return;
    }

    let userQuery = event.query;
    const isManualRun = event.eventType === 'workflow_dispatch' || !event.issueNumber;

    if (isManualRun && (!userQuery || userQuery.trim().length === 0)) {
      core.info('ℹ️ Manual workflow_dispatch detected without explicit query. Running diagnostic verification.');
      userQuery = 'How does the hybrid RAG architecture and reciprocal rank fusion work?';
    }

    // Trigger keyword check & query cleaning
    if (triggerKeyword !== 'auto' && !isManualRun) {
      if (!userQuery.includes(triggerKeyword)) {
        core.info(`Query does not contain trigger keyword '${triggerKeyword}'. Skipping.`);
        core.setOutput('retrieved-chunks-count', 0);
        core.setOutput('response-status', 'skipped');
        return;
      }

      // Remove trigger keyword so trigger tokens do not pollute search scoring
      userQuery = userQuery.split(triggerKeyword).join(' ').trim();
      if (!userQuery || userQuery.length === 0) {
        core.setOutput('retrieved-chunks-count', 0);
        core.setOutput('response-status', 'failed');
        core.setFailed(`User query is empty after removing query-trigger "${triggerKeyword}". Cannot perform retrieval without a query.`);
        return;
      }
    }

    // Empty query validation
    if (!userQuery || userQuery.trim().length === 0) {
      core.setOutput('retrieved-chunks-count', 0);
      core.setOutput('response-status', 'failed');
      core.setFailed('User query is empty. Cannot perform retrieval without a query.');
      return;
    }

    // Check token requirement when commenting is needed
    if (event.issueNumber && !token) {
      throw new Error('github-token input is required to post responses to GitHub Issues and Pull Requests.');
    }

    core.info(`📖 Scanning and indexing documentation from: ${docsPathInput}`);
    const documents = collectDocuments(docsPathInput);
    const chunker = new DocumentChunker();
    const allChunks = [];

    // Safe iteration accumulation avoiding V8 function call argument stack limits
    for (const doc of documents) {
      const chunks = chunker.chunkMarkdown(doc.content, doc.filePath);
      for (let c = 0; c < chunks.length; c++) {
        allChunks.push(chunks[c]);
      }
    }

    core.info(`Indexed ${allChunks.length} structural chunks from ${documents.length} files.`);
    if (allChunks.length === 0) {
      core.warning('No document chunks found to index.');
      core.setOutput('retrieved-chunks-count', 0);
      core.setOutput('response-status', 'skipped');
      return;
    }

    // 1. Sparse BM25 Search
    core.info('🔍 Executing Okapi BM25 Lexical Search...');
    const bm25 = new BM25Index();
    bm25.buildIndex(allChunks);
    const bm25Results = bm25.search(userQuery, topK * 2);

    // 2. Deterministic Feature-Vector Retrieval
    core.info('🔢 Executing deterministic feature-vector retrieval...');
    const vectorIndex = new FeatureVectorIndex();
    vectorIndex.buildIndex(allChunks);
    const featureResults = vectorIndex.search(userQuery, topK * 2);

    // 3. Reciprocal Rank Fusion
    core.info('⚡ Fusing search modalities via RRF...');
    const rrf = new ReciprocalRankFusion({ k: rrfK });
    const fusedResults = rrf.fuse([bm25Results, featureResults], [1.0, 1.2]);

    // 4. Context Budget & Chunk Selection
    // Enforce a maximum context character budget (32,000 chars ~ 8,000 tokens)
    // to prevent prompt inflation on extreme top-k configurations while preserving top ranks.
    const MAX_CONTEXT_CHAR_BUDGET = 32000;
    const topCandidateContext = fusedResults.slice(0, topK);
    const topContext = [];
    let currentBudgetChars = 0;

    for (const chunk of topCandidateContext) {
      const chunkSize = chunk.doc?.text ? chunk.doc.text.length : 0;
      if (topContext.length > 0 && currentBudgetChars + chunkSize > MAX_CONTEXT_CHAR_BUDGET) {
        core.info(`Context budget cap (${MAX_CONTEXT_CHAR_BUDGET} chars) reached; retaining top ${topContext.length} ranked passages.`);
        break;
      }
      topContext.push(chunk);
      currentBudgetChars += chunkSize;
    }

    core.info(`Top ${topContext.length} fused context chunks selected (${currentBudgetChars} chars).`);

    // 5. Grounded Inference via GitHub Models
    core.info(`🤖 Generating grounded answer via GitHub Models (${modelName})...`);
    const llm = new LLMClient({
      token,
      model: modelName,
      repoContext: { owner: event.owner, repo: event.repo }
    });

    const inferenceResult = await llm.generateGroundedAnswer(userQuery, topContext);
    const answerMarkdown = inferenceResult.text;

    if (event.issueNumber) {
      const finalComment = `${answerMarkdown}\n\n---\n*⚡ Powered by [Hybrid RAG Action](https://github.com/Cagrik34/hybrid-rag-action) (BM25 + Feature-Vector Fusion)*`;
      await gh.postComment(event.issueNumber, finalComment);
      core.info(`✅ Successfully responded to Issue/PR #${event.issueNumber} (mode: ${inferenceResult.mode}).`);
    } else {
      core.info(`✅ Diagnostic dry-run complete (mode: ${inferenceResult.mode}). Generated grounded answer:`);
      core.info(answerMarkdown);
    }

    core.setOutput('retrieved-chunks-count', topContext.length);
    core.setOutput('response-status', inferenceResult.mode === 'remote' ? 'success' : 'fallback');
  } catch (error) {
    core.setOutput('response-status', 'failed');
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

// Export helper for direct unit testing of strict parsing and context budgeting
module.exports = {
  parseStrictInteger,
  run
};

if (require.main === module) {
  run();
}
