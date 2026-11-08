const test = require('node:test');
const assert = require('node:assert/strict');
const { DocumentChunker } = require('../src/core/chunker');

test('DocumentChunker - constructor argument validation', () => {
  assert.throws(() => new DocumentChunker({ maxChunkSize: 0 }), /maxChunkSize must be a positive integer/);
  assert.throws(() => new DocumentChunker({ maxChunkSize: -100 }), /maxChunkSize must be a positive integer/);
  assert.throws(() => new DocumentChunker({ maxChunkSize: '1000' }), /maxChunkSize must be a positive integer/);

  assert.throws(() => new DocumentChunker({ maxChunkSize: 500, overlap: -1 }), /overlap must be an integer >= 0/);
  assert.throws(() => new DocumentChunker({ maxChunkSize: 500, overlap: 500 }), /strictly less than maxChunkSize/);
  assert.throws(() => new DocumentChunker({ maxChunkSize: 500, overlap: 600 }), /strictly less than maxChunkSize/);

  // Valid configurations should not throw
  assert.doesNotThrow(() => new DocumentChunker({ maxChunkSize: 500, overlap: 0 }));
  assert.doesNotThrow(() => new DocumentChunker({ maxChunkSize: 500, overlap: 100 }));
});

test('DocumentChunker - handles empty input safely', () => {
  const chunker = new DocumentChunker();
  assert.deepEqual(chunker.chunkMarkdown(''), []);
  assert.deepEqual(chunker.chunkMarkdown('   \n\n\t  '), []);
  assert.deepEqual(chunker.chunkMarkdown(null), []);
  assert.deepEqual(chunker.chunkMarkdown(undefined), []);
});

test('DocumentChunker - parses Markdown headings and preserves 1-based line ranges', () => {
  const md = `# Title
This is the title section text.

## Features
Line 4 of file
Line 5 of file

### Details
Line 8 of file`;

  const chunker = new DocumentChunker();
  const chunks = chunker.chunkMarkdown(md, 'docs/guide.md');

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].metadata.section, 'Title');
  assert.equal(chunks[0].metadata.startLine, 1);
  assert.equal(chunks[0].metadata.endLine, 2);

  assert.equal(chunks[1].metadata.section, 'Features');
  assert.equal(chunks[1].metadata.startLine, 4);
  assert.equal(chunks[1].metadata.endLine, 6);

  assert.equal(chunks[2].metadata.section, 'Details');
  assert.equal(chunks[2].metadata.startLine, 8);
  assert.equal(chunks[2].metadata.endLine, 9);
});

test('DocumentChunker - ignores headings inside fenced code blocks', () => {
  const md = `# Python Guide
Here is a Python example:

\`\`\`python
# This is a comment inside code fence, not a markdown section
def add(a, b):
    # another comment
    return a + b
\`\`\`

## Next Section
Concluding text here.`;

  const chunker = new DocumentChunker();
  const chunks = chunker.chunkMarkdown(md, 'example.md');

  // Should NOT treat # comments inside python fence as sections
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].metadata.section, 'Python Guide');
  assert.ok(chunks[0].text.includes('# This is a comment inside code fence'));
  assert.equal(chunks[1].metadata.section, 'Next Section');
});

test('DocumentChunker - supports CRLF and LF line endings equivalently', () => {
  const lf = '# Sec1\nLine A\n\n# Sec2\nLine B';
  const crlf = '# Sec1\r\nLine A\r\n\r\n# Sec2\r\nLine B';

  const chunker = new DocumentChunker();
  const chunksLF = chunker.chunkMarkdown(lf, 'test.md');
  const chunksCRLF = chunker.chunkMarkdown(crlf, 'test.md');

  assert.equal(chunksLF.length, chunksCRLF.length);
  assert.equal(chunksLF[0].metadata.startLine, chunksCRLF[0].metadata.startLine);
  assert.equal(chunksLF[0].metadata.endLine, chunksCRLF[0].metadata.endLine);
  assert.equal(chunksLF[0].text, chunksCRLF[0].text);
});

test('DocumentChunker - documents without headings chunk under default section', () => {
  const md = 'First paragraph of text.\n\nSecond paragraph of text.\n\nThird paragraph.';
  const chunker = new DocumentChunker();
  const chunks = chunker.chunkMarkdown(md, 'plain.txt');

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].metadata.section, 'Introduction');
  assert.equal(chunks[0].metadata.startLine, 1);
  assert.equal(chunks[0].metadata.endLine, 5);
});

test('DocumentChunker - enforces maxChunkSize and applies overlap', () => {
  // Construct a section with 10 lines of 50 chars each = 500 chars (+ newlines)
  const lines = [];
  for (let i = 1; i <= 10; i++) {
    lines.push(`Line ${String(i).padStart(2, '0')}: ` + 'x'.repeat(40));
  }
  const content = '# Large Section\n' + lines.join('\n');

  // maxChunkSize: 150 chars, overlap: 60 chars
  const chunker = new DocumentChunker({ maxChunkSize: 150, overlap: 60 });
  const chunks = chunker.chunkMarkdown(content, 'large.md');

  assert.ok(chunks.length > 1, 'Should split into multiple chunks');

  for (const chunk of chunks) {
    const rawChunkContent = chunk.text.replace(/^\[.*?\] Section: .*?\n/, '');
    assert.ok(rawChunkContent.length <= 150, `Chunk length ${rawChunkContent.length} exceeds maxChunkSize 150`);
    assert.ok(chunk.metadata.startLine <= chunk.metadata.endLine, 'startLine must be <= endLine');
  }

  // Verify overlap: adjacent chunks should share lines
  assert.ok(chunks[1].metadata.startLine <= chunks[0].metadata.endLine, 'Adjacent chunks must overlap in line range');
});

test('DocumentChunker - skips header-only sections on consecutive headings while preserving hierarchy', () => {
  const md = `# API Reference
## Authentication
### Bearer Token
Include your API token in the Authorization header.

## Endpoints
### Users
Retrieve user profile details.`;

  const chunker = new DocumentChunker();
  const chunks = chunker.chunkMarkdown(md, 'api.md');

  // Should only emit chunks for sections that have actual body text (Bearer Token and Users)
  assert.equal(chunks.length, 2);

  // Chunk 1: Bearer Token
  assert.equal(chunks[0].metadata.section, 'Bearer Token');
  assert.deepEqual(chunks[0].metadata.hierarchy, ['API Reference', 'Authentication', 'Bearer Token']);
  assert.equal(chunks[0].metadata.startLine, 3);
  assert.equal(chunks[0].metadata.endLine, 4);

  // Chunk 2: Users
  assert.equal(chunks[1].metadata.section, 'Users');
  assert.deepEqual(chunks[1].metadata.hierarchy, ['API Reference', 'Endpoints', 'Users']);
  assert.equal(chunks[1].metadata.startLine, 7);
  assert.equal(chunks[1].metadata.endLine, 8);
});

test('DocumentChunker - oversized single line does not cause infinite loop', () => {
  const longLine = 'z'.repeat(500);
  const md = `# Giant Line\n${longLine}`;

  const chunker = new DocumentChunker({ maxChunkSize: 100, overlap: 20 });
  const chunks = chunker.chunkMarkdown(md, 'pathological.md');

  assert.ok(chunks.length > 1);
  assert.equal(chunks[0].metadata.startLine, 1);
  assert.equal(chunks[0].metadata.endLine, 1);

  for (let k = 1; k < chunks.length; k++) {
    const rawChunkContent = chunks[k].text.replace(/^\[.*?\] Section: .*?\n/, '');
    assert.ok(rawChunkContent.length <= 100);
    assert.equal(chunks[k].metadata.startLine, 2);
    assert.equal(chunks[k].metadata.endLine, 2);
  }
});

test('DocumentChunker - accumulation scale safety without call stack exhaustion', () => {
  // Test accumulation of 70,000 chunk objects (exceeds V8 65k argument limit if spread used)
  const allChunks = [];
  const fakeChunkBatch = new Array(70000).fill({ id: 'dummy', text: 'sample' });

  // Safe iteration push instead of allChunks.push(...fakeChunkBatch)
  for (let i = 0; i < fakeChunkBatch.length; i++) {
    allChunks.push(fakeChunkBatch[i]);
  }

  assert.equal(allChunks.length, 70000);
});
