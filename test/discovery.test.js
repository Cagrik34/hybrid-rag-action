const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { collectDocuments } = require('../src/core/discovery');

test('DocumentCollector - recursive directory scan and explicit files', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-discovery-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  // Create test directory tree
  const docsDir = path.join(tmpDir, 'docs');
  const subDir = path.join(docsDir, 'sub');
  fs.mkdirSync(subDir, { recursive: true });

  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Root Readme');
  fs.writeFileSync(path.join(docsDir, 'guide.md'), '# Guide');
  fs.writeFileSync(path.join(subDir, 'advanced.mdx'), '# Advanced MDX');
  fs.writeFileSync(path.join(docsDir, 'ignored.png'), 'binary'); // unsupported extension

  const docs = collectDocuments('README.md,docs', { rootDir: tmpDir });

  assert.equal(docs.length, 3);
  const paths = docs.map(d => d.filePath);
  assert.ok(paths.includes('README.md'));
  assert.ok(paths.includes('docs/guide.md'));
  assert.ok(paths.includes('docs/sub/advanced.mdx'));
  assert.ok(!paths.includes('docs/ignored.png'));
});

test('DocumentCollector - ignores .git, node_modules, and dist directories', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-ignore-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const nodeModulesDir = path.join(tmpDir, 'node_modules', 'some-pkg');
  const gitDir = path.join(tmpDir, '.git');
  const distDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(nodeModulesDir, { recursive: true });
  fs.mkdirSync(gitDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });

  fs.writeFileSync(path.join(nodeModulesDir, 'package.md'), '# Pkg');
  fs.writeFileSync(path.join(gitDir, 'COMMIT_EDITMSG.txt'), 'commit');
  fs.writeFileSync(path.join(distDir, 'bundle.txt'), 'dist content');
  fs.writeFileSync(path.join(tmpDir, 'valid.md'), '# Valid file');

  const docs = collectDocuments('node_modules,.git,dist,valid.md', { rootDir: tmpDir });

  assert.equal(docs.length, 1);
  assert.equal(docs[0].filePath, 'valid.md');
});

test('DocumentCollector - deterministic ordering of discovered files', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-order-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(tmpDir, 'z.md'), '# Z');
  fs.writeFileSync(path.join(tmpDir, 'a.md'), '# A');
  fs.writeFileSync(path.join(tmpDir, 'm.md'), '# M');

  const docs1 = collectDocuments('.', { rootDir: tmpDir });
  const docs2 = collectDocuments('.', { rootDir: tmpDir });

  assert.deepEqual(docs1.map(d => d.filePath), ['a.md', 'm.md', 'z.md']);
  assert.deepEqual(docs1.map(d => d.filePath), docs2.map(d => d.filePath));
});

test('DocumentCollector - rejects workspace escaping traversal attempts', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-traversal-test-'));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-outside-test-'));
  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  fs.writeFileSync(path.join(outsideDir, 'secret.md'), '# Secret Outside Workspace');
  fs.writeFileSync(path.join(tmpDir, 'safe.md'), '# Safe File');

  // Relative path traversal attack: ../rag-outside-test-.../secret.md
  const relEscape = path.relative(tmpDir, path.join(outsideDir, 'secret.md'));
  const docsTraversal = collectDocuments(`${relEscape},safe.md`, { rootDir: tmpDir });

  assert.equal(docsTraversal.length, 1);
  assert.equal(docsTraversal[0].filePath, 'safe.md');

  // Absolute outside path
  const docsAbsolute = collectDocuments(`${path.join(outsideDir, 'secret.md')},safe.md`, { rootDir: tmpDir });
  assert.equal(docsAbsolute.length, 1);
  assert.equal(docsAbsolute[0].filePath, 'safe.md');
});
