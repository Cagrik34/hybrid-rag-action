/**
 * Hybrid RAG GitHub Action Orchestrator Entry Point.
 */

const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const { DocumentChunker } = require('./core/chunker');
const { BM25Index } = require('./core/bm25');
const { DenseVectorIndex } = require('./core/vector');
const { ReciprocalRankFusion } = require('./core/rrf');
const { LLMClient } = require('./integrations/llm');
const { GitHubAdapter } = require('./integrations/github');

async function run() {
  try {
    core.info('🚀 Initializing Hybrid RAG Action...');

    const token = core.getInput('github-token') || process.env.GITHUB_TOKEN;
    const docsPathInput = core.getInput('docs-path') || 'README.md,action.yml,docs,CONTRIBUTING.md';
    const triggerKeyword = core.getInput('query-trigger') || 'auto';
    const topK = parseInt(core.getInput('top-k') || '5', 10);
    const rrfK = parseInt(core.getInput('rrf-k') || '60', 10);
    const llmProvider = core.getInput('llm-provider') || 'github-models';
    const modelName = core.getInput('model-name') || 'Phi-4';
    const apiKey = core.getInput('api-key') || token;

    const gh = new GitHubAdapter(token);
    const event = gh.getEventData();

    let userQuery = event.query;
    const isManualRun = !event.issueNumber;

    if (isManualRun) {
      core.info('ℹ️ Manual workflow_dispatch detected. Executing diagnostic dry-run search.');
      userQuery = 'How does the hybrid RAG architecture and reciprocal rank fusion work?';
    }

    if (triggerKeyword !== 'auto' && !userQuery.includes(triggerKeyword) && !isManualRun) {
      core.info(`Query does not contain trigger keyword '${triggerKeyword}'. Skipping.`);
      return;
    }

    core.info(`📖 Scanning and indexing documentation from: ${docsPathInput}`);
    const chunker = new DocumentChunker();
    const allChunks = [];

    const targetPaths = docsPathInput.split(',').map(p => p.trim());
    for (const target of targetPaths) {
      if (fs.existsSync(target)) {
        const stats = fs.statSync(target);
        if (stats.isDirectory()) {
          const files = fs.readdirSync(target);
          for (const file of files) {
            if (file.endsWith('.md') || file.endsWith('.mdx') || file.endsWith('.txt') || file.endsWith('.yml') || file.endsWith('.yaml')) {
              const fullPath = path.join(target, file);
              const content = fs.readFileSync(fullPath, 'utf8');
              allChunks.push(...chunker.chunkMarkdown(content, path.relative(process.cwd(), fullPath)));
            }
          }
        } else if (stats.isFile()) {
          const content = fs.readFileSync(target, 'utf8');
          allChunks.push(...chunker.chunkMarkdown(content, path.relative(process.cwd(), target)));
        }
      }
    }

    core.info(`Indexed ${allChunks.length} structural chunks.`);
    if (allChunks.length === 0) {
      core.warning('No document chunks found to index.');
      return;
    }

    // 1. Sparse BM25 Search
    core.info('🔍 Executing Okapi BM25 Sparse Search...');
    const bm25 = new BM25Index();
    bm25.buildIndex(allChunks);
    const bm25Results = bm25.search(userQuery, topK * 2);

    // 2. Dense Semantic Vector Search
    core.info('🧠 Executing Dense Semantic Vector Search...');
    const vectorIndex = new DenseVectorIndex();
    vectorIndex.buildIndex(allChunks);
    const denseResults = vectorIndex.search(userQuery, topK * 2);

    // 3. Reciprocal Rank Fusion
    core.info('⚡ Fusing search modalities via RRF...');
    const rrf = new ReciprocalRankFusion({ k: rrfK });
    const fusedResults = rrf.fuse([bm25Results, denseResults], [1.0, 1.2]);
    const topContext = fusedResults.slice(0, topK);

    core.info(`Top ${topContext.length} fused context chunks selected.`);

    // 4. Grounded Inference
    core.info(`🤖 Generating grounded answer using ${llmProvider} (${modelName})...`);
    const llm = new LLMClient({ provider: llmProvider, apiKey, model: modelName });
    const answerMarkdown = await llm.generateGroundedAnswer(userQuery, topContext);

    if (event.issueNumber) {
      const finalComment = `${answerMarkdown}\n\n---\n*⚡ Powered by [Hybrid RAG Action](https://github.com/Cagrik34/hybrid-rag-action) (BM25 + Semantic Vector Fusion)*`;
      await gh.postComment(event.issueNumber, finalComment);
      core.info(`✅ Successfully responded to Issue/PR #${event.issueNumber}.`);
    } else {
      core.info('✅ Diagnostic dry-run complete. Generated grounded answer:');
      core.info(answerMarkdown);
    }

    core.setOutput('retrieved-chunks-count', topContext.length);
    core.setOutput('response-status', 'success');
  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

run();
