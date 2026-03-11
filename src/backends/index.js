/**
 * Backend registry — maps backend type strings to classes.
 */

import { GitHubBackend } from './github.js';
// import { GitLabBackend } from './gitlab.js';  // Not yet implemented

const BACKENDS = {
  github: GitHubBackend,
};

const BACKEND_REQUIREMENTS = {
  github: { required: ['repo'], description: 'source add <name> --backend github --repo owner/repo' },
  // gitlab: { required: ['url', 'project'], description: 'source add <name> --backend gitlab --url https://gitlab.co --project team/kb' },
};

export function createBackend(name, sourceConfig) {
  const BackendClass = BACKENDS[sourceConfig.backend];
  if (!BackendClass) {
    throw new Error(`Unknown backend type "${sourceConfig.backend}". Available: ${listBackendTypes().join(', ')}`);
  }
  return new BackendClass(name, sourceConfig);
}

/**
 * Validate a source definition before persisting it.
 * Throws if backend is unknown or missing required fields.
 */
export function validateSourceDef(def) {
  if (!BACKENDS[def.backend]) {
    throw new Error(`Unknown backend "${def.backend}". Available: ${listBackendTypes().join(', ')}`);
  }

  const reqs = BACKEND_REQUIREMENTS[def.backend];
  if (reqs) {
    for (const field of reqs.required) {
      if (!def[field]) {
        throw new Error(`Backend "${def.backend}" requires --${field}. Usage: ${reqs.description}`);
      }
    }
  }
}

export function listBackendTypes() {
  return Object.keys(BACKENDS);
}
