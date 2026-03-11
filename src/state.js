/**
 * hangout-ai — Cooldown state persistence
 *
 * Tracks when actions were last taken to enforce cooldown periods.
 * State stored at ~/.hangout-ai/state.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const STATE_FILE = join(homedir(), '.hangout-ai', 'state.json');

function load() {
  if (!existsSync(STATE_FILE)) return { last_actions: {}, history: [] };
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
}

function save(state) {
  const dir = join(homedir(), '.hangout-ai');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function getLastAction(action) {
  return load().last_actions[action] || null;
}

export function isCoolingDown(action, durationMs, now = Date.now()) {
  if (!durationMs) return false;
  const last = getLastAction(action);
  if (!last?.at) return false;
  return now - Date.parse(last.at) < durationMs;
}

export function record(action, meta = {}, now = Date.now()) {
  const state = load();
  const entry = { action, at: new Date(now).toISOString(), meta };
  state.last_actions[action] = entry;
  state.history = [entry, ...(state.history || [])].slice(0, 50);
  save(state);
  return entry;
}

export function getSnapshot() {
  return load();
}
