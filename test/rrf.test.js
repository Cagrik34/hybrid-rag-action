const test = require('node:test');
const assert = require('node:assert/strict');
const { ReciprocalRankFusion } = require('../src/core/rrf');

test('RRF - exact numerical score for known ranks', () => {
  const rrf = new ReciprocalRankFusion({ k: 60 });
  const list = [
    { id: 'docA', score: 10.0, doc: {} },
    { id: 'docB', score: 5.0, doc: {} }
  ];

  const results = rrf.fuse([list], [1.0]);
  assert.equal(results.length, 2);

  const expectedRank1Score = 1.0 / (60 + 1); // 1/61
  const expectedRank2Score = 1.0 / (60 + 2); // 1/62

  assert.ok(Math.abs(results[0].rrfScore - expectedRank1Score) < 1e-10);
  assert.ok(Math.abs(results[1].rrfScore - expectedRank2Score) < 1e-10);
  assert.equal(results[0].id, 'docA');
  assert.equal(results[1].id, 'docB');
});

test('RRF - respects modality weighting', () => {
  const rrf = new ReciprocalRankFusion({ k: 60 });
  const listA = [{ id: 'docA', score: 1.0, doc: {} }];
  const listB = [{ id: 'docB', score: 1.0, doc: {} }];

  // List A has weight 2.0, List B has weight 1.0
  const results = rrf.fuse([listA, listB], [2.0, 1.0]);
  assert.equal(results.length, 2);
  assert.equal(results[0].id, 'docA');

  const expectedDocAScore = 2.0 / (60 + 1);
  const expectedDocBScore = 1.0 / (60 + 1);
  assert.ok(Math.abs(results[0].rrfScore - expectedDocAScore) < 1e-10);
  assert.ok(Math.abs(results[1].rrfScore - expectedDocBScore) < 1e-10);
});

test('RRF - handles empty lists safely', () => {
  const rrf = new ReciprocalRankFusion({ k: 60 });
  assert.deepEqual(rrf.fuse([]), []);
  assert.deepEqual(rrf.fuse([[], []]), []);
});

test('RRF - accumulates duplicate documents across modalities', () => {
  const rrf = new ReciprocalRankFusion({ k: 60 });
  // doc-shared appears in both modalities
  const listA = [
    { id: 'doc-shared', score: 10, doc: { name: 'shared' } },
    { id: 'doc-onlyA', score: 5, doc: {} }
  ];
  const listB = [
    { id: 'doc-onlyB', score: 8, doc: {} },
    { id: 'doc-shared', score: 6, doc: { name: 'shared' } }
  ];

  const results = rrf.fuse([listA, listB], [1.0, 1.0]);
  assert.equal(results[0].id, 'doc-shared');

  const expectedSharedScore = (1.0 / (60 + 1)) + (1.0 / (60 + 2));
  assert.ok(Math.abs(results[0].rrfScore - expectedSharedScore) < 1e-10);
  assert.equal(results[0].ranks.modality_0, 1);
  assert.equal(results[0].ranks.modality_1, 2);
});

test('RRF - deterministic tie-breaking strategy', () => {
  const rrf = new ReciprocalRankFusion({ k: 60 });
  // Both docs have identical rank in single modality
  const listA = [{ id: 'doc-zeta', score: 1, doc: {} }];
  const listB = [{ id: 'doc-alpha', score: 1, doc: {} }];

  const results = rrf.fuse([listA, listB], [1.0, 1.0]);
  // Both have score 1/61; tie-breaker is alphabetical doc ID
  assert.equal(results[0].id, 'doc-alpha');
  assert.equal(results[1].id, 'doc-zeta');
});

test('RRF - constructor validates k parameter', () => {
  assert.throws(() => new ReciprocalRankFusion({ k: 0 }), /positive integer/);
  assert.throws(() => new ReciprocalRankFusion({ k: -10 }), /positive integer/);
  assert.throws(() => new ReciprocalRankFusion({ k: '60' }), /positive integer/);
});
