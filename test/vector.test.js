const test = require('node:test');
const assert = require('node:assert/strict');
const { FeatureVectorIndex, DenseVectorIndex } = require('../src/core/vector');

test('FeatureVectorIndex - backwards compatibility alias', () => {
  assert.strictEqual(DenseVectorIndex, FeatureVectorIndex);
  const index = new DenseVectorIndex();
  assert.ok(index instanceof FeatureVectorIndex);
});

test('FeatureVectorIndex - cosine identity (self similarity is 1.0)', () => {
  const index = new FeatureVectorIndex({ dimensions: 128 });
  const vec = index.generateFeatureVector('Hybrid RAG retrieval and reciprocal rank fusion');
  const sim = FeatureVectorIndex.cosineSimilarity(vec, vec);
  assert.ok(Math.abs(sim - 1.0) < 1e-6, `Expected ~1.0, got ${sim}`);
});

test('FeatureVectorIndex - zero-vector behavior returns 0 without NaN', () => {
  const zeroVec = new Float32Array(128);
  const normalVec = new Float32Array(128).fill(1.0);

  assert.equal(FeatureVectorIndex.norm(zeroVec), 0);
  assert.equal(FeatureVectorIndex.cosineSimilarity(zeroVec, normalVec), 0);
  assert.equal(FeatureVectorIndex.cosineSimilarity(normalVec, zeroVec), 0);
  assert.equal(FeatureVectorIndex.cosineSimilarity(zeroVec, zeroVec), 0);
});

test('FeatureVectorIndex - deterministic embedding generation', () => {
  const index = new FeatureVectorIndex({ dimensions: 128 });
  const text = 'Deterministic token and bigram DJB2 feature hashing';
  const vec1 = index.generateFeatureVector(text);
  const vec2 = index.generateFeatureVector(text);
  const vec3 = index.generateSemanticEmbedding(text); // Backwards-compatible alias

  assert.deepEqual(vec1, vec2);
  assert.deepEqual(vec1, vec3);
  assert.equal(vec1.length, 128);
});

test('FeatureVectorIndex - expected ranking for relevant documents', () => {
  const docs = [
    { id: 'doc1', text: 'GitHub Actions workflow automation and continuous integration.' },
    { id: 'doc2', text: 'Reciprocal rank fusion and sparse lexical search with BM25.' },
    { id: 'doc3', text: 'Machine learning inference with Phi-4 on local execution runtimes.' }
  ];

  const index = new FeatureVectorIndex({ dimensions: 128 });
  index.buildIndex(docs);

  const results = index.search('continuous integration workflow Actions', 2);
  assert.ok(results.length > 0);
  assert.equal(results[0].id, 'doc1');
  assert.ok(results[0].score > 0);
});

test('FeatureVectorIndex - empty index search returns empty array', () => {
  const index = new FeatureVectorIndex();
  index.buildIndex([]);
  assert.deepEqual(index.search('any query'), []);
});

test('FeatureVectorIndex - supports pre-computed numeric embedding input', () => {
  const dim = 4;
  const index = new FeatureVectorIndex({ dimensions: dim });
  const docs = [
    { id: 'vec-a', text: 'doc a', embedding: [1, 0, 0, 0] },
    { id: 'vec-b', text: 'doc b', embedding: [0, 1, 0, 0] }
  ];

  index.buildIndex(docs);
  const results = index.search([1, 0, 0, 0], 2);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'vec-a');
  assert.ok(Math.abs(results[0].score - 1.0) < 1e-6);
});

test('FeatureVectorIndex - dimension mismatch policy throws RangeError', () => {
  const vec4 = [1, 2, 3, 4];
  const vec5 = [1, 2, 3, 4, 5];

  assert.throws(() => {
    FeatureVectorIndex.dotProduct(vec4, vec5);
  }, /dimension mismatch/i);

  assert.throws(() => {
    FeatureVectorIndex.cosineSimilarity(vec4, vec5);
  }, /dimension mismatch/i);

  const index = new FeatureVectorIndex({ dimensions: 128 });
  assert.throws(() => {
    index.buildIndex([{ id: 'bad-dim', text: 'test', embedding: [1, 2, 3] }]);
  }, /dimension mismatch/i);

  index.buildIndex([{ id: 'good', text: 'valid text' }]);
  assert.throws(() => {
    index.search([1, 2, 3], 2);
  }, /dimension mismatch/i);
});
