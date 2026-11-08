const test = require('node:test');
const assert = require('node:assert/strict');
const { BM25Index } = require('../src/core/bm25');

test('BM25 - expected ranking for relevant documents', () => {
  const docs = [
    { id: 'doc1', text: 'Okapi BM25 ranking and scoring algorithm uses term frequency and inverse document frequency.' },
    { id: 'doc2', text: 'GitHub Actions workflow automation and deployment pipelines.' },
    { id: 'doc3', text: 'Inverse document frequency (IDF) in information retrieval and BM25 scoring.' }
  ];

  const bm25 = new BM25Index({ k1: 1.5, b: 0.75 });
  bm25.buildIndex(docs);

  const results = bm25.search('BM25 algorithm scoring', 2);
  assert.equal(results.length, 2);
  assert.equal(results[0].id, 'doc1');
  assert.ok(results[0].score > results[1].score);
  assert.ok(results[0].score > 0);
});

test('BM25 - empty index returns empty results', () => {
  const bm25 = new BM25Index();
  bm25.buildIndex([]);
  const results = bm25.search('test query');
  assert.deepEqual(results, []);
});

test('BM25 - empty query or stopword-only query returns empty results', () => {
  const docs = [{ id: 'doc1', text: 'Sample document text here.' }];
  const bm25 = new BM25Index();
  bm25.buildIndex(docs);

  assert.deepEqual(bm25.search(''), []);
  assert.deepEqual(bm25.search('   '), []);
  assert.deepEqual(bm25.search('the and or in of'), []);
});

test('BM25 - topK limits output count and validates arguments', () => {
  const docs = [
    { id: 'doc1', text: 'query word one' },
    { id: 'doc2', text: 'query word two' },
    { id: 'doc3', text: 'query word three' },
    { id: 'doc4', text: 'query word four' }
  ];

  const bm25 = new BM25Index();
  bm25.buildIndex(docs);

  const results = bm25.search('query', 2);
  assert.equal(results.length, 2);

  // Invalid topK
  assert.deepEqual(bm25.search('query', 0), []);
  assert.deepEqual(bm25.search('query', -5), []);
  assert.deepEqual(bm25.search('query', NaN), []);
});

test('BM25 - deterministic ranking with tie-breaking strategy', () => {
  // Two documents with identical matching words
  const docs = [
    { id: 'doc-beta', text: 'identical match' },
    { id: 'doc-alpha', text: 'identical match' }
  ];

  const bm25 = new BM25Index();
  bm25.buildIndex(docs);

  const results1 = bm25.search('identical match', 2);
  const results2 = bm25.search('identical match', 2);

  assert.equal(results1.length, 2);
  // Equal scores should tie-break deterministically by ID (doc-alpha before doc-beta)
  assert.equal(results1[0].id, 'doc-alpha');
  assert.equal(results1[1].id, 'doc-beta');
  assert.deepEqual(results1, results2);
});

test('BM25 - numerical sanity (no NaN, non-negative scores, finite values)', () => {
  const docs = [
    { id: 'doc1', text: 'word word word word word' },
    { id: 'doc2', text: 'word' }
  ];

  const bm25 = new BM25Index();
  bm25.buildIndex(docs);
  const results = bm25.search('word', 2);

  for (const r of results) {
    assert.ok(Number.isFinite(r.score), 'Score must be finite');
    assert.ok(!Number.isNaN(r.score), 'Score must not be NaN');
    assert.ok(r.score > 0, 'Score must be positive');
  }
});
