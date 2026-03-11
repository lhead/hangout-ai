/**
 * hangout-ai — Config, cache, and preferences management
 *
 * Handles:
 *   - Global config (~/.hangout-ai/config.json) with auto-migration from old format
 *   - Project config (.hangout-ai.json) for per-project source overrides
 *   - Per-source cache files (cache-{name}.json)
 *   - Preferences (watch/no_watch/publish/no_publish)
 *   - Source CRUD (add/remove/get/list)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { validateSourceDef } from './backends/index.js';

const BASE_DIR = join(homedir(), '.hangout-ai');
const CONFIG_FILE = join(BASE_DIR, 'config.json');
const PREF_TYPES = ['watch', 'no_watch', 'publish', 'no_publish'];

const DEFAULT_SOURCE = { backend: 'github', repo: 'lhead/hangout-ai-data' };

export { BASE_DIR, CONFIG_FILE, PREF_TYPES, DEFAULT_SOURCE };

// --- Config I/O ---

export function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    return {
      sources: { default: DEFAULT_SOURCE },
      default_publish: 'default',
      prefs: {},
    };
  }
  const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  return migrateConfig(raw);
}

export function saveConfig(config) {
  if (!existsSync(BASE_DIR)) mkdirSync(BASE_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Auto-migrate old format { repo, token, prefs } → new format { sources, prefs }
 * Deletes token from config (tokens come from env vars now).
 */
function migrateConfig(raw) {
  if (raw.sources) return raw; // already new format

  const migrated = { sources: {}, prefs: raw.prefs || {} };

  if (raw.repo) {
    migrated.sources.default = { backend: 'github', repo: raw.repo };
    migrated.default_publish = 'default';
  }

  // Save migrated config (drops token)
  if (raw.repo || raw.token) {
    saveConfig(migrated);
  }

  return migrated;
}

// --- Project Config ---

export function loadProjectConfig() {
  let dir = process.cwd();
  while (true) {
    const file = join(dir, '.hangout-ai.json');
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf-8'));
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// --- Source Resolution ---

export function resolvePublishSource(explicit) {
  const config = loadConfig();
  if (explicit) {
    if (!config.sources[explicit]) throw new Error(`Source "${explicit}" not found. Run: source list`);
    return explicit;
  }
  const proj = loadProjectConfig();
  if (proj?.publish) {
    if (!config.sources[proj.publish]) throw new Error(`Project config references unknown source "${proj.publish}"`);
    return proj.publish;
  }
  if (config.default_publish) {
    if (!config.sources[config.default_publish]) throw new Error(`Default publish source "${config.default_publish}" not found`);
    return config.default_publish;
  }
  const names = Object.keys(config.sources);
  if (names.length === 1) return names[0];
  if (names.length === 0) throw new Error('No sources configured. Run: source add <name> --backend github --repo owner/repo');
  throw new Error(`Multiple sources available. Specify with --to <source>. Available: ${names.join(', ')}`);
}

export function resolveFeedSources(explicit) {
  const config = loadConfig();
  if (explicit) {
    if (!config.sources[explicit]) throw new Error(`Source "${explicit}" not found. Run: source list`);
    return [explicit];
  }
  const proj = loadProjectConfig();
  if (proj?.feed) {
    const feeds = Array.isArray(proj.feed) ? proj.feed : [proj.feed];
    for (const f of feeds) {
      if (!config.sources[f]) throw new Error(`Project config references unknown source "${f}"`);
    }
    return feeds;
  }
  const names = Object.keys(config.sources);
  if (names.length === 0) throw new Error('No sources configured. Run: source add <name> --backend github --repo owner/repo');
  return names;
}

// --- Source CRUD ---

export function addSource(name, def) {
  validateSourceDef(def);
  const config = loadConfig();
  config.sources[name] = def;
  if (Object.keys(config.sources).length === 1) {
    config.default_publish = name;
  }
  saveConfig(config);
  return { status: 'added', name, ...def };
}

export function removeSource(name) {
  const config = loadConfig();
  if (!config.sources[name]) throw new Error(`Source "${name}" not found`);
  const removed = config.sources[name];
  delete config.sources[name];
  if (config.default_publish === name) {
    const remaining = Object.keys(config.sources);
    config.default_publish = remaining.length === 1 ? remaining[0] : undefined;
  }
  saveConfig(config);
  return { status: 'removed', name, ...removed };
}

export function getSource(name) {
  const config = loadConfig();
  if (!config.sources[name]) throw new Error(`Source "${name}" not found`);
  return { name, ...config.sources[name] };
}

export function listSources() {
  const config = loadConfig();
  return Object.entries(config.sources).map(([name, def]) => ({
    name,
    ...def,
    is_default: config.default_publish === name,
  }));
}

// --- Preferences ---

export function getPrefs() {
  const config = loadConfig();
  const prefs = config.prefs || {};
  return Object.fromEntries(PREF_TYPES.map(t => [t, prefs[t] || []]));
}

export function addPref(type, rule) {
  if (!PREF_TYPES.includes(type)) throw new Error(`Invalid type. Use: ${PREF_TYPES.join(', ')}`);
  const config = loadConfig();
  if (!config.prefs) config.prefs = {};
  if (!config.prefs[type]) config.prefs[type] = [];
  config.prefs[type].push(rule);
  saveConfig(config);
  return getPrefs();
}

export function removePref(type, index) {
  if (!PREF_TYPES.includes(type)) throw new Error(`Invalid type. Use: ${PREF_TYPES.join(', ')}`);
  const config = loadConfig();
  const list = config.prefs?.[type];
  if (!list || index < 1 || index > list.length) {
    throw new Error('Invalid index. Use "prefs" to see current rules.');
  }
  const removed = list.splice(index - 1, 1)[0];
  saveConfig(config);
  return { removed, ...getPrefs() };
}

// --- Cache ---

export function readCache(sourceName) {
  const file = join(BASE_DIR, `cache-${sourceName}.json`);
  if (!existsSync(file)) return { updated_at: null, messages: [] };
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export function writeCache(sourceName, data) {
  if (!existsSync(BASE_DIR)) mkdirSync(BASE_DIR, { recursive: true });
  const file = join(BASE_DIR, `cache-${sourceName}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
}
