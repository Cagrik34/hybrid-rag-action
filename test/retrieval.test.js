/**
 * Comprehensive Unit and Retrieval Test Suite for Hybrid RAG Engine.
 */

const assert = require('assert');
const { tokenize } = require('../src/core/tokenizer');
const { BM25Index } = require('../src/core/bm25');
const { DenseVectorIndex } = require('../src/core/vector');
const { ReciprocalRankFusion } = require('../src/core/rrf');
const { DocumentChunker } = require('../src/core/chunker');

console.log('🧪 Starting Hybrid RAG Verification Suite...\n');

// Test 1: Tokenizer
console.log('Test 1: Tokenizer & Stopword Stripping');
const tokens = tokenize('The quick brown fox jumps over the lazy dog and API token 123.');
assert(tokens.includes('quick'), 'Should contain "quick"');
assert(!tokens.includes('the'), 'Should strip stopword "the"');
assert(tokens.includes('123'), 'Should keep numbers');
console.log('  ✅ Tokenizer test passed.\n');

// Test 2: BM25 Lexical Ranking
console.log('Test 2: Okapi BM25 Search');
const docs = [
  { id: 'doc1', text: 'Azure OpenAI models provide enterprise grade LLM deployments.', metadata: { filePath: 'docs/azure.md', startLine: 1, endLine: 10, section: 'Overview' } },
  { id: 'doc2', text: 'Phi-4 Mini is a lightweight high performance SLM running locally on ONNX runtime.', metadata: { filePath: 'docs/phi4.md', startLine: 1, endLine: 15, section: 'Phi-4' } },
  { id: 'doc3', text: 'Python scripts for data scraping and web automation.', metadata: { filePath: 'docs/python.md', startLine: 1, endLine: 20, section: 'Scripts' } }
];

const bm25 = new BM25Index();
bm25.buildIndex(docs);
const bm25Res = bm25.search('Phi-4 ONNX runtime SLM', 2);
assert.strictEqual(bm25Res[0].id, 'doc2', 'Top result should be doc2 for Phi-4 query');
console.log('  ✅ BM25 scoring test passed.\n');

// Test 3: Dense Cosine Similarity
console.log('Test 3: Dense Vector Cosine Similarity');
const vecIndex = new DenseVectorIndex();
vecIndex.buildIndex(docs);
const vecRes = vecIndex.search('lightweight local model onnx', 2);
assert.strictEqual(vecRes[0].id, 'doc2', 'Semantic search should match doc2');
console.log('  ✅ Dense vector test passed.\n');

// Test 4: Reciprocal Rank Fusion (RRF)
console.log('Test 4: Reciprocal Rank Fusion (RRF)');
const rrf = new ReciprocalRankFusion({ k: 60 });
const fused = rrf.fuse([bm25Res, vecRes], [1.0, 1.0]);
assert(fused.length > 0, 'Fused results should not be empty');
assert.strictEqual(fused[0].id, 'doc2', 'Fused top result should be doc2');
assert(fused[0].rrfScore > 0, 'RRF score should be strictly positive');
console.log('  ✅ RRF fusion test passed.\n');

// Test 5: Structure-Aware Markdown Chunker
console.log('Test 5: Markdown Document Chunker');
const mdContent = `# Introduction
This is the introduction section.

## Architecture
The hybrid RAG architecture combines sparse and dense indices.

## Configuration
Set GITHUB_TOKEN in your workflow secrets.`;

const chunker = new DocumentChunker();
const chunks = chunker.chunkMarkdown(mdContent, 'README.md');
assert.strictEqual(chunks.length, 3, 'Should produce 3 header-based chunks');
assert.strictEqual(chunks[1].metadata.section, 'Architecture');
assert(chunks[1].text.includes('hybrid RAG architecture'));
console.log('  ✅ Chunker test passed.\n');

console.log('🎉 ALL 5 TEST SUITES PASSED FLAWLESSLY (100% SUCCESS)!');
