const test = require('node:test');
const assert = require('node:assert/strict');
const { tokenize, STOP_WORDS } = require('../src/core/tokenizer');

test('Tokenizer - stopword filtering', () => {
  const text = 'The quick brown fox jumps over the lazy dog and enters into a cave';
  const tokensWithFilter = tokenize(text, true);
  assert.ok(!tokensWithFilter.includes('the'));
  assert.ok(!tokensWithFilter.includes('and'));
  assert.ok(!tokensWithFilter.includes('into'));
  assert.ok(!tokensWithFilter.includes('a'));
  assert.ok(tokensWithFilter.includes('quick'));
  assert.ok(tokensWithFilter.includes('brown'));
  assert.ok(tokensWithFilter.includes('fox'));

  const tokensNoFilter = tokenize(text, false);
  assert.ok(tokensNoFilter.includes('the'));
  assert.ok(tokensNoFilter.includes('and'));
  assert.ok(tokensNoFilter.includes('a'));
});

test('Tokenizer - punctuation handling', () => {
  const text = 'hello, world! (foo-bar: [test_value]) {baz}? -- standalone - hyphen';
  const tokens = tokenize(text);
  assert.deepEqual(tokens, ['hello', 'world', 'foo-bar', 'test_value', 'baz', 'standalone', 'hyphen']);
});

test('Tokenizer - number handling', () => {
  const text = 'Phi-4 mini runs on ONNX runtime with 128 dimensions and 2026 specs';
  const tokens = tokenize(text);
  assert.ok(tokens.includes('128'));
  assert.ok(tokens.includes('2026'));
  assert.ok(tokens.includes('phi-4'));
});

test('Tokenizer - empty and whitespace input', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('   \n\t  '), []);
  assert.deepEqual(tokenize('--- ___ ---'), []);
});

test('Tokenizer - non-string input handling', () => {
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
  assert.deepEqual(tokenize(12345), []);
  assert.deepEqual(tokenize({ text: 'sample' }), []);
  assert.deepEqual(tokenize(['word']), []);
});

test('Tokenizer - multilingual Unicode behavior across scripts', () => {
  // Turkish characters
  const turkishText = 'Sistem yapılandırma, güvenlik ve çalıştırma adımları.';
  const turkishTokens = tokenize(turkishText);
  assert.ok(turkishTokens.includes('yapılandırma'));
  assert.ok(turkishTokens.includes('güvenlik'));
  assert.ok(turkishTokens.includes('çalıştırma'));

  // Accented Latin
  const accentedText = 'café résumé naïve coöperation 100%';
  const accentedTokens = tokenize(accentedText);
  assert.ok(accentedTokens.includes('café'));
  assert.ok(accentedTokens.includes('résumé'));
  assert.ok(accentedTokens.includes('naïve'));

  // Cyrillic script
  const cyrillicText = 'Быстрый поиск и контекст модели';
  const cyrillicTokens = tokenize(cyrillicText);
  assert.ok(cyrillicTokens.includes('быстрый'));
  assert.ok(cyrillicTokens.includes('поиск'));
  assert.ok(cyrillicTokens.includes('контекст'));

  // Greek script
  const greekText = 'Αρχιτεκτονική συστήματος ανάκτησης';
  const greekTokens = tokenize(greekText);
  assert.ok(greekTokens.includes('αρχιτεκτονική'));
  assert.ok(greekTokens.includes('συστήματος'));

  // CJK script
  const cjkText = 'RAG 混合检索 2026 测试';
  const cjkTokens = tokenize(cjkText);
  assert.ok(cjkTokens.includes('混合检索'));
  assert.ok(cjkTokens.includes('测试'));
});
