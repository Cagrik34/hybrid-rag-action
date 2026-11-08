/**
 * GitHub Event Handler and Octokit Comment Publisher.
 * Supports Issues, Pull Requests, issue/PR comments, and manual workflow runs.
 */

const github = require('@actions/github');

class GitHubAdapter {
  /**
   * @param {string} [token] GitHub authentication token
   * @param {Object} [options]
   * @param {Object} [options.context] Custom context (for testing/dependency injection)
   * @param {Object} [options.octokit] Custom octokit instance (for testing/mocking)
   */
  constructor(token, options = {}) {
    this.token = token || '';
    this.context = options.context || github.context;
    if (options.octokit) {
      this.octokit = options.octokit;
    } else if (this.token) {
      this.octokit = github.getOctokit(this.token);
    } else {
      this.octokit = null;
    }
  }

  /**
   * Extracts query, eventType, and repository context from the incoming webhook payload.
   * Explicitly distinguishes: 'issue', 'pull_request', 'comment', 'workflow_dispatch', or 'unsupported'.
   *
   * @returns {{
   *   eventType: 'issue'|'pull_request'|'comment'|'workflow_dispatch'|'unsupported',
   *   owner: string,
   *   repo: string,
   *   issueNumber: number|null,
   *   query: string,
   *   isPR: boolean,
   *   sender: string
   * }}
   */
  getEventData() {
    const eventName = this.context.eventName || '';
    const payload = this.context.payload || {};
    const repo = this.context.repo || { owner: '', repo: '' };

    let eventType = 'unsupported';
    let issueNumber = null;
    let isPR = false;
    let query = '';

    if (eventName === 'issue_comment') {
      eventType = 'comment';
      if (payload.comment && payload.comment.body) {
        query = payload.comment.body;
      }
      if (payload.issue) {
        issueNumber = payload.issue.number;
        isPR = Boolean(payload.issue.pull_request);
      }
    } else if (eventName === 'pull_request_review_comment') {
      eventType = 'comment';
      if (payload.comment && payload.comment.body) {
        query = payload.comment.body;
      }
      issueNumber = payload.pull_request?.number || payload.issue?.number || null;
      isPR = true;
    } else if (eventName === 'issues') {
      eventType = 'issue';
      if (payload.issue) {
        issueNumber = payload.issue.number;
        query = [payload.issue.title, payload.issue.body || ''].filter(Boolean).join('\n');
      }
    } else if (eventName === 'pull_request' || eventName === 'pull_request_target') {
      eventType = 'pull_request';
      if (payload.pull_request) {
        issueNumber = payload.pull_request.number;
        isPR = true;
        query = [payload.pull_request.title, payload.pull_request.body || ''].filter(Boolean).join('\n');
      }
    } else if (eventName === 'workflow_dispatch') {
      eventType = 'workflow_dispatch';
      query = payload.inputs?.query || '';
    } else {
      // Fallback inference from payload shape if eventName is missing or simulated
      if (payload.comment && (payload.issue || payload.pull_request)) {
        eventType = 'comment';
        query = payload.comment.body || '';
        issueNumber = payload.issue?.number || payload.pull_request?.number || null;
        isPR = Boolean(payload.pull_request || payload.issue?.pull_request);
      } else if (payload.pull_request) {
        eventType = 'pull_request';
        issueNumber = payload.pull_request.number;
        isPR = true;
        query = [payload.pull_request.title, payload.pull_request.body || ''].filter(Boolean).join('\n');
      } else if (payload.issue) {
        eventType = 'issue';
        issueNumber = payload.issue.number;
        query = [payload.issue.title, payload.issue.body || ''].filter(Boolean).join('\n');
      } else if (Object.keys(payload).length === 0) {
        // Empty payload defaults to manual/dispatch dry-run
        eventType = 'workflow_dispatch';
        query = '';
      }
    }

    return {
      eventType,
      owner: repo.owner || '',
      repo: repo.repo || '',
      issueNumber,
      query: (query || '').trim(),
      isPR,
      sender: payload.sender?.login || 'unknown'
    };
  }

  /**
   * Posts a markdown comment on the issue or PR.
   * @param {number} issueNumber
   * @param {string} markdownBody
   * @returns {Promise<any>}
   */
  async postComment(issueNumber, markdownBody) {
    if (!issueNumber) {
      throw new Error('issueNumber is required to post a comment');
    }
    if (!this.octokit) {
      throw new Error('GitHub token is required to post a comment to an issue or pull request');
    }

    const repo = this.context.repo || { owner: '', repo: '' };
    return await this.octokit.rest.issues.createComment({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issueNumber,
      body: markdownBody
    });
  }
}

module.exports = { GitHubAdapter };
