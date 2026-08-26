/**
 * GitHub Event Handler and Octokit Publisher.
 */

const github = require('@actions/github');

class GitHubAdapter {
  constructor(token) {
    this.token = token;
    this.octokit = github.getOctokit(token);
    this.context = github.context;
  }

  /**
   * Extracts query and context from the incoming webhook payload.
   */
  getEventData() {
    const payload = this.context.payload;
    let query = '';
    let issueNumber = null;
    let isPR = false;

    if (payload.issue) {
      issueNumber = payload.issue.number;
      query = payload.comment ? payload.comment.body : `${payload.issue.title}\n${payload.issue.body || ''}`;
    } else if (payload.pull_request) {
      issueNumber = payload.pull_request.number;
      isPR = true;
      query = payload.comment ? payload.comment.body : `${payload.pull_request.title}\n${payload.pull_request.body || ''}`;
    }

    return {
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      issueNumber,
      query: query.trim(),
      isPR,
      sender: payload.sender?.login || 'unknown'
    };
  }

  /**
   * Posts a markdown comment on the issue or PR.
   */
  async postComment(issueNumber, markdownBody) {
    if (!issueNumber) return;
    
    await this.octokit.rest.issues.createComment({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      issue_number: issueNumber,
      body: markdownBody
    });
  }
}

module.exports = { GitHubAdapter };
