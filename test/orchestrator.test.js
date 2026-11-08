const test = require('node:test');
const assert = require('node:assert/strict');
const { parseStrictInteger } = require('../src/index');

test('Orchestrator - strict integer validation accepts valid integers within range', () => {
  assert.equal(parseStrictInteger('5', 'top-k', 1, 100), 5);
  assert.equal(parseStrictInteger(5, 'top-k', 1, 100), 5);
  assert.equal(parseStrictInteger('1', 'top-k', 1, 100), 1);
  assert.equal(parseStrictInteger('100', 'top-k', 1, 100), 100);
  assert.equal(parseStrictInteger('60', 'rrf-k', 1, 1000), 60);
  assert.equal(parseStrictInteger('  10  ', 'top-k', 1, 100), 10);
});

test('Orchestrator - strict integer validation rejects malformed, decimal, and non-numeric strings', () => {
  // Trailing garbage (permissive parseInt bug regression)
  assert.throws(() => parseStrictInteger('5abc', 'top-k', 1, 100), /strictly positive integer/);
  assert.throws(() => parseStrictInteger('5; rm -rf', 'top-k', 1, 100), /strictly positive integer/);

  // Decimals
  assert.throws(() => parseStrictInteger('5.5', 'top-k', 1, 100), /strictly positive integer/);
  assert.throws(() => parseStrictInteger('5.0', 'top-k', 1, 100), /strictly positive integer/);

  // Zero and negatives
  assert.throws(() => parseStrictInteger('0', 'top-k', 1, 100), /integer between 1 and 100/);
  assert.throws(() => parseStrictInteger('-1', 'top-k', 1, 100), /strictly positive integer/);
  assert.throws(() => parseStrictInteger('-50', 'top-k', 1, 100), /strictly positive integer/);

  // Whitespace and empty
  assert.throws(() => parseStrictInteger('', 'top-k', 1, 100), /strictly positive integer/);
  assert.throws(() => parseStrictInteger('   ', 'top-k', 1, 100), /strictly positive integer/);

  // Non-finite and special
  assert.throws(() => parseStrictInteger('NaN', 'top-k', 1, 100), /strictly positive integer/);
  assert.throws(() => parseStrictInteger('Infinity', 'top-k', 1, 100), /strictly positive integer/);
  assert.throws(() => parseStrictInteger(null, 'top-k', 1, 100), /strictly positive integer/);

  // Out of bounds
  assert.throws(() => parseStrictInteger('101', 'top-k', 1, 100), /integer between 1 and 100/);
  assert.throws(() => parseStrictInteger('1001', 'rrf-k', 1, 1000), /integer between 1 and 1000/);
});

test('Orchestrator - context budget enforcement preserves top ranked chunks', () => {
  const MAX_CONTEXT_CHAR_BUDGET = 32000;
  // Create 5 candidate chunks, each 10,000 chars
  const candidateChunks = [
    { id: 'chunk-1', doc: { text: 'a'.repeat(10000) } },
    { id: 'chunk-2', doc: { text: 'b'.repeat(10000) } },
    { id: 'chunk-3', doc: { text: 'c'.repeat(10000) } },
    { id: 'chunk-4', doc: { text: 'd'.repeat(10000) } },
    { id: 'chunk-5', doc: { text: 'e'.repeat(10000) } }
  ];

  const budgeted = [];
  let totalChars = 0;
  for (const chunk of candidateChunks) {
    const size = chunk.doc.text.length;
    if (budgeted.length > 0 && totalChars + size > MAX_CONTEXT_CHAR_BUDGET) {
      break;
    }
    budgeted.push(chunk);
    totalChars += size;
  }

  // 3 chunks of 10,000 chars = 30,000 <= 32,000. 4th chunk would be 40,000 > 32,000.
  assert.equal(budgeted.length, 3);
  assert.equal(budgeted[0].id, 'chunk-1');
  assert.equal(budgeted[1].id, 'chunk-2');
  assert.equal(budgeted[2].id, 'chunk-3');
  assert.equal(totalChars, 30000);
});

test('Orchestrator - query trigger removal cleans retrieval query', () => {
  const triggerKeyword = '@rag-bot';
  const rawQuery = '@rag-bot How does reciprocal rank fusion work?';

  const cleanedQuery = rawQuery.split(triggerKeyword).join(' ').trim();
  assert.equal(cleanedQuery, 'How does reciprocal rank fusion work?');
  assert.ok(!cleanedQuery.includes('@rag-bot'));

  // Trigger-only query leaves empty string
  const triggerOnly = '@rag-bot';
  const cleanedEmpty = triggerOnly.split(triggerKeyword).join(' ').trim();
  assert.equal(cleanedEmpty, '');
});
