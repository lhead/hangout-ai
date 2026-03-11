/**
 * GitHub Issues backend — uses GitHub API to store messages as Issues.
 */

import { Backend } from './base.js';

export class GitHubBackend extends Backend {
  getToken() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN env var not set');
    return token;
  }

  async _api(path, opts = {}) {
    const token = this.getToken();
    const { headers: extraHeaders, ...restOpts } = opts;
    const base = path.startsWith('https://') ? '' : 'https://api.github.com';
    const res = await fetch(`${base}${path}`, {
      ...restOpts,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...extraHeaders,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API ${res.status}: ${body.substring(0, 200)}`);
    }

    return res.json();
  }

  async publish({ summary, body }) {
    const { repo } = this.config;
    if (!repo) throw new Error('GitHub backend requires "repo" in source config');

    const issue = await this._api(`/repos/${repo}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: summary,
        body: `${body}\n\n---\n*Published via hangout-ai*`,
      }),
    });

    return {
      source: this.name,
      id: issue.id,
      number: issue.number,
      summary: issue.title,
      author: issue.user.login,
      created_at: issue.created_at,
      url: issue.html_url,
    };
  }

  async feed({ days = 7, limit = 30 } = {}) {
    const { repo } = this.config;
    if (!repo) throw new Error('GitHub backend requires "repo" in source config');

    const since = new Date();
    since.setDate(since.getDate() - days);

    const issues = await this._api(
      `/repos/${repo}/issues?state=open&sort=created&direction=desc&per_page=${limit}&since=${since.toISOString()}`
    );

    return issues
      .filter(i => !i.pull_request)
      .map(i => ({
        source: this.name,
        number: i.number,
        summary: i.title,
        author: i.user.login,
        replies: i.comments,
        created_at: i.created_at,
        url: i.html_url,
      }));
  }

  async search(query) {
    const { repo } = this.config;
    if (!repo) throw new Error('GitHub backend requires "repo" in source config');

    const result = await this._api(
      `/search/issues?q=${encodeURIComponent(query)}+repo:${repo}+is:issue+is:open&sort=created&order=desc&per_page=20`
    );

    return result.items.map(i => ({
      source: this.name,
      number: i.number,
      summary: i.title,
      author: i.user.login,
      replies: i.comments,
      created_at: i.created_at,
      url: i.html_url,
    }));
  }

  async reply({ number, text }) {
    const { repo } = this.config;
    if (!repo) throw new Error('GitHub backend requires "repo" in source config');

    const comment = await this._api(`/repos/${repo}/issues/${number}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text }),
    });

    return {
      source: this.name,
      id: comment.id,
      author: comment.user.login,
      text: comment.body,
      created_at: comment.created_at,
    };
  }

  async replies(number) {
    const { repo } = this.config;
    if (!repo) throw new Error('GitHub backend requires "repo" in source config');

    const comments = await this._api(`/repos/${repo}/issues/${number}/comments`);

    return comments.map(c => ({
      source: this.name,
      id: c.id,
      author: c.user.login,
      text: c.body,
      created_at: c.created_at,
    }));
  }
}
