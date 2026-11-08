const test = require('node:test');
const assert = require('node:assert/strict');
const { GitHubAdapter } = require('../src/integrations/github');

test('GitHubAdapter - extracts issue event correctly', () => {
  const mockContext = {
    eventName: 'issues',
    repo: { owner: 'test-owner', repo: 'test-repo' },
    payload: {
      issue: {
        number: 42,
        title: 'Feature Request: Add Offline Mode',
        body: 'Can we run this without external API calls?'
      },
      sender: { login: 'developer-user' }
    }
  };

  const adapter = new GitHubAdapter('mock-token', { context: mockContext });
  const data = adapter.getEventData();

  assert.equal(data.eventType, 'issue');
  assert.equal(data.issueNumber, 42);
  assert.equal(data.isPR, false);
  assert.equal(data.owner, 'test-owner');
  assert.equal(data.repo, 'test-repo');
  assert.equal(data.sender, 'developer-user');
  assert.ok(data.query.includes('Feature Request'));
  assert.ok(data.query.includes('external API calls'));
});

test('GitHubAdapter - extracts pull_request event correctly', () => {
  const mockContext = {
    eventName: 'pull_request',
    repo: { owner: 'test-owner', repo: 'test-repo' },
    payload: {
      pull_request: {
        number: 101,
        title: 'fix: optimize RRF score calculation',
        body: 'Closes #100. Improves ranking latency.'
      },
      sender: { login: 'contributor-user' }
    }
  };

  const adapter = new GitHubAdapter('mock-token', { context: mockContext });
  const data = adapter.getEventData();

  assert.equal(data.eventType, 'pull_request');
  assert.equal(data.issueNumber, 101);
  assert.equal(data.isPR, true);
  assert.ok(data.query.includes('optimize RRF'));
});

test('GitHubAdapter - extracts issue_comment on an issue and PR correctly', () => {
  // Comment on an Issue
  const issueCommentContext = {
    eventName: 'issue_comment',
    repo: { owner: 'test-owner', repo: 'test-repo' },
    payload: {
      issue: { number: 55 },
      comment: { body: '@rag-bot how does the chunker work?' },
      sender: { login: 'commenter' }
    }
  };

  const adapter1 = new GitHubAdapter('mock-token', { context: issueCommentContext });
  const data1 = adapter1.getEventData();
  assert.equal(data1.eventType, 'comment');
  assert.equal(data1.issueNumber, 55);
  assert.equal(data1.isPR, false);
  assert.equal(data1.query, '@rag-bot how does the chunker work?');

  // Comment on a PR (GitHub sets issue.pull_request in payload)
  const prCommentContext = {
    eventName: 'issue_comment',
    repo: { owner: 'test-owner', repo: 'test-repo' },
    payload: {
      issue: { number: 77, pull_request: { url: 'https://api.github.com/repos/...' } },
      comment: { body: '@rag-bot explain this PR' },
      sender: { login: 'pr-reviewer' }
    }
  };

  const adapter2 = new GitHubAdapter('mock-token', { context: prCommentContext });
  const data2 = adapter2.getEventData();
  assert.equal(data2.eventType, 'comment');
  assert.equal(data2.issueNumber, 77);
  assert.equal(data2.isPR, true);
});

test('GitHubAdapter - handles manual workflow_dispatch and empty payloads', () => {
  const manualContext = {
    eventName: 'workflow_dispatch',
    repo: { owner: 'test-owner', repo: 'test-repo' },
    payload: {
      inputs: { query: 'Manual diagnostic query' }
    }
  };

  const adapter = new GitHubAdapter('mock-token', { context: manualContext });
  const data = adapter.getEventData();

  assert.equal(data.eventType, 'workflow_dispatch');
  assert.equal(data.issueNumber, null);
  assert.equal(data.query, 'Manual diagnostic query');
});

test('GitHubAdapter - marks unsupported events appropriately', () => {
  const unsupportedEvents = ['push', 'discussion', 'release', 'schedule'];

  for (const eventName of unsupportedEvents) {
    const mockContext = {
      eventName,
      repo: { owner: 'test-owner', repo: 'test-repo' },
      payload: { action: 'created' }
    };
    const adapter = new GitHubAdapter('mock-token', { context: mockContext });
    const data = adapter.getEventData();
    assert.equal(data.eventType, 'unsupported', `Expected ${eventName} to be marked unsupported`);
  }
});

test('GitHubAdapter - postComment calls Octokit with exact parameters', async () => {
  let capturedParams = null;
  const mockOctokit = {
    rest: {
      issues: {
        createComment: async (params) => {
          capturedParams = params;
          return { data: { id: 999 } };
        }
      }
    }
  };

  const mockContext = {
    repo: { owner: 'acme-inc', repo: 'super-rag' }
  };

  const adapter = new GitHubAdapter('token', { context: mockContext, octokit: mockOctokit });
  await adapter.postComment(42, 'Hello from assistant!');

  assert.deepEqual(capturedParams, {
    owner: 'acme-inc',
    repo: 'super-rag',
    issue_number: 42,
    body: 'Hello from assistant!'
  });
});
