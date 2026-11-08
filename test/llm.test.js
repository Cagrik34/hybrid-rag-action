/**
 * LLMClient unit tests — GitHub Models only.
 *
 * All tests use fully in-memory mock transports (no live network calls).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { LLMClient } = require('../src/integrations/llm');

/** Build a mock HTTP transport whose handler is called when req.end() fires. */
function createMockTransport(handler) {
  return {
    request(options, callback) {
      const req = new EventEmitter();
      req.write = () => {};
      req.end = () => {
        process.nextTick(() => {
          handler(options, req, callback);
        });
      };
      req.setTimeout = (ms, cb) => {
        if (options.simulateTimeout) {
          process.nextTick(cb);
        }
      };
      req.destroy = (err) => {
        if (err) req.emit('error', err);
      };
      return req;
    }
  };
}

/** Returns a mock transport that emits a successful JSON response. */
function successTransport(content) {
  return createMockTransport((options, req, callback) => {
    const res = new EventEmitter();
    res.statusCode = 200;
    callback(res);
    res.emit('data', JSON.stringify({ choices: [{ message: { content } }] }));
    res.emit('end');
  });
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

test('LLMClient - constructs without error when no arguments provided', () => {
  assert.doesNotThrow(() => new LLMClient());
});

test('LLMClient - constructs with explicit token', () => {
  assert.doesNotThrow(() => new LLMClient({ token: 'ghs_test_token' }));
});

test('LLMClient - token is never logged (no debug/log call exposes token)', () => {
  // Verify the source does not reference the token in a logging context.
  // This is a static guard: read the module source and confirm no log line references this.token directly.
  const src = require('fs').readFileSync(require.resolve('../src/integrations/llm'), 'utf8');
  // 'Authorization' header construction is allowed; raw 'this.token' must not appear in log/debug calls.
  const logCalls = src.match(/(?:console\.log|core\.debug|core\.info|core\.warning|core\.error)\([^)]*this\.token[^)]*\)/g);
  assert.equal(logCalls, null, 'Token must not appear in any logging call');
});

// ---------------------------------------------------------------------------
// Successful GitHub Models inference
// ---------------------------------------------------------------------------

test('LLMClient - successful mocked GitHub Models response returns mode=remote', async () => {
  const client = new LLMClient({
    token: 'ghs_test_token',
    model: 'Phi-4',
    transport: successTransport('Mocked successful grounded answer.')
  });

  const result = await client.generateGroundedAnswer('How to use this action?', []);
  assert.equal(result.mode, 'remote');
  assert.equal(result.text, 'Mocked successful grounded answer.');
  assert.ok(!('provider' in result), 'result must not expose a provider field');
});

// ---------------------------------------------------------------------------
// UTF-8 multibyte split boundary
// ---------------------------------------------------------------------------

test('LLMClient - multibyte UTF-8 characters split across chunk boundaries decode accurately', async () => {
  // Payload containing Turkish characters and an emoji: "Başarılı: yapılandırma ve çalıştırma tamamlandı 🚀"
  const payloadStr = JSON.stringify({
    choices: [
      { message: { content: 'Başarılı: yapılandırma ve çalıştırma tamamlandı 🚀' } }
    ]
  });
  const fullBytes = Buffer.from(payloadStr, 'utf8');

  // The emoji 🚀 is 4 bytes: 0xF0 0x9F 0x9A 0x80; split right through it.
  const splitIndex = fullBytes.length - 3;
  const chunk1 = fullBytes.subarray(0, splitIndex);
  const chunk2 = fullBytes.subarray(splitIndex);

  const transport = createMockTransport((options, req, callback) => {
    const res = new EventEmitter();
    res.statusCode = 200;
    callback(res);
    res.emit('data', chunk1);
    res.emit('data', chunk2);
    res.emit('end');
  });

  const client = new LLMClient({ token: 'ghs_token', transport });
  const result = await client.generateGroundedAnswer('query', []);
  assert.equal(result.mode, 'remote');
  assert.ok(!result.text.includes('\uFFFD'), 'Decoded text must not contain unicode replacement character');
  assert.equal(result.text, 'Başarılı: yapılandırma ve çalıştırma tamamlandı 🚀');
});

// ---------------------------------------------------------------------------
// Fallback cases
// ---------------------------------------------------------------------------

test('LLMClient - fallback on malformed JSON response', async () => {
  const transport = createMockTransport((options, req, callback) => {
    const res = new EventEmitter();
    res.statusCode = 200;
    callback(res);
    res.emit('data', '<html>Bad Gateway or HTML Error Page</html>');
    res.emit('end');
  });

  const client = new LLMClient({ token: 'ghs_token', transport });
  const result = await client.generateGroundedAnswer('test query', []);
  assert.equal(result.mode, 'fallback');
  assert.ok(result.reason.includes('Failed to parse response JSON'));
  assert.ok(result.text.includes('Hybrid RAG Context Analysis'));
});

test('LLMClient - fallback on non-2xx status code', async () => {
  const transport = createMockTransport((options, req, callback) => {
    const res = new EventEmitter();
    res.statusCode = 500;
    callback(res);
    res.emit('data', JSON.stringify({ error: 'Internal Server Error' }));
    res.emit('end');
  });

  const client = new LLMClient({ token: 'ghs_token', transport });
  const result = await client.generateGroundedAnswer('test query', []);
  assert.equal(result.mode, 'fallback');
  assert.ok(result.reason.includes('Remote API returned HTTP status 500'));
});

test('LLMClient - fallback on connection error', async () => {
  const transport = createMockTransport((options, req) => {
    req.emit('error', new Error('connect ECONNREFUSED 127.0.0.1:443'));
  });

  const client = new LLMClient({ token: 'ghs_token', transport });
  const result = await client.generateGroundedAnswer('test query', []);
  assert.equal(result.mode, 'fallback');
  assert.ok(result.reason.includes('ECONNREFUSED'));
});

test('LLMClient - fallback on request timeout', async () => {
  const transport = {
    request(options) {
      const req = new EventEmitter();
      req.write = () => {};
      req.end = () => {};
      req.setTimeout = (ms, cb) => {
        process.nextTick(cb);
      };
      req.destroy = (err) => {
        if (err) req.emit('error', err);
      };
      return req;
    }
  };

  const client = new LLMClient({ token: 'ghs_token', timeoutMs: 50, transport });
  const result = await client.generateGroundedAnswer('test query', []);
  assert.equal(result.mode, 'fallback');
  assert.ok(result.reason.includes('timed out'));
});

test('LLMClient - fallback on missing choices in response', async () => {
  const transport = createMockTransport((options, req, callback) => {
    const res = new EventEmitter();
    res.statusCode = 200;
    callback(res);
    res.emit('data', JSON.stringify({ choices: [] }));
    res.emit('end');
  });

  const client = new LLMClient({ token: 'ghs_token', transport });
  const result = await client.generateGroundedAnswer('test query', []);
  assert.equal(result.mode, 'fallback');
  assert.ok(result.reason.includes('Malformed response'));
});

test('LLMClient - enforces maximum response size limit (2MB)', async () => {
  const transport = createMockTransport((options, req, callback) => {
    const res = new EventEmitter();
    res.statusCode = 200;
    callback(res);
    // 500 bytes vs maxBodyBytes: 100
    res.emit('data', Buffer.alloc(500, 'x'));
  });

  const client = new LLMClient({ token: 'ghs_token', maxBodyBytes: 100, transport });
  const result = await client.generateGroundedAnswer('test query', []);
  assert.equal(result.mode, 'fallback');
  assert.ok(result.reason.includes('exceeded maximum limit'));
});

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

test('LLMClient - safe citations format without bogus URLs', () => {
  // Without repoContext -> plain text citation
  const clientWithoutContext = new LLMClient();
  const citation1 = clientWithoutContext.formatCitation({
    filePath: 'docs/guide.md',
    startLine: 10,
    endLine: 25
  });
  assert.equal(citation1, '[docs/guide.md#L10-L25]');

  // With repoContext -> valid GitHub URL
  const clientWithContext = new LLMClient({
    repoContext: { owner: 'acme', repo: 'super-rag' }
  });
  const citation2 = clientWithContext.formatCitation({
    filePath: 'src/index.js',
    startLine: 5,
    endLine: 12
  });
  assert.ok(citation2.startsWith('[src/index.js#L5-L12]('));
  assert.ok(citation2.includes('acme/super-rag/blob/'));
  assert.ok(!citation2.includes('github.com/src/index.js'));
});

// ---------------------------------------------------------------------------
// No-provider inputs accepted via Action contract
// ---------------------------------------------------------------------------

test('LLMClient - no llm-provider, endpoint, or api-key arguments accepted', () => {
  // Constructor signature must not expose provider/endpoint/apiKey knobs.
  const client = new LLMClient({ token: 'ghs_token' });
  assert.ok(!('provider' in client), 'LLMClient must not expose a provider property');
  assert.ok(!('apiKey' in client), 'LLMClient must not expose an apiKey property');
  // endpoint is hardcoded; not an input – the parsed URL is used internally only
  assert.ok(!Object.prototype.hasOwnProperty.call(client, 'endpoint') ||
    client.endpoint === undefined,
    'LLMClient must not expose a configurable endpoint property');
});
