/**
 * GitLab backend — stub implementation.
 * TODO: Implement using GitLab Issues API.
 */

import { Backend } from './base.js';

export class GitLabBackend extends Backend {
  getToken() {
    const token = process.env.GITLAB_TOKEN;
    if (!token) throw new Error('GITLAB_TOKEN env var not set');
    return token;
  }

  // TODO: POST /api/v4/projects/:id/issues
  async publish({ summary, body }) {
    throw new Error('GitLab backend not yet implemented');
  }

  // TODO: GET /api/v4/projects/:id/issues?state=opened&order_by=created_at
  async feed({ days, limit }) {
    throw new Error('GitLab backend not yet implemented');
  }

  // TODO: GET /api/v4/projects/:id/issues?search=query
  async search(query) {
    throw new Error('GitLab backend not yet implemented');
  }

  // TODO: POST /api/v4/projects/:id/issues/:iid/notes
  async reply({ number, text }) {
    throw new Error('GitLab backend not yet implemented');
  }

  // TODO: GET /api/v4/projects/:id/issues/:iid/notes
  async replies(number) {
    throw new Error('GitLab backend not yet implemented');
  }
}
