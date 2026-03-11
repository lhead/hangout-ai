/**
 * hangout-ai — Policy engine
 *
 * Converts structured signals from the Skill into action decisions.
 * Deterministic — no LLM involved. Checks:
 *   - Signal → candidate action mapping
 *   - Confidence thresholds
 *   - Cooldown state
 *   - Preference matching (no_publish / no_watch)
 *   - Required fields (draft summary, query context)
 */

import { getPrefs } from './config.js';
import * as state from './state.js';

const PUBLISH_SIGNALS = new Set([
  'problem_solved', 'discovery', 'recommendation',
  'strong_opinion', 'explicit_publish',
]);

const SEARCH_SIGNALS = new Set([
  'user_stuck', 'repeated_failure', 'blocked', 'explicit_search',
]);

const FEED_SIGNALS = new Set([
  'natural_pause', 'explicit_feed',
]);

const DEFAULTS = {
  confidence_thresholds: { publish: 0.7, search: 0.6, browse_feed: 0.5 },
  cooldowns: {
    suggest_publish_ms: 30 * 60 * 1000,
    suggest_search_ms: 10 * 60 * 1000,
    browse_feed_ms: 30 * 60 * 1000,
  },
};

function actionForSignal(signal) {
  if (PUBLISH_SIGNALS.has(signal)) return 'suggest_publish';
  if (SEARCH_SIGNALS.has(signal)) return 'suggest_search';
  if (FEED_SIGNALS.has(signal)) return 'browse_feed';
  return 'no_action';
}

function thresholdFor(action) {
  switch (action) {
    case 'suggest_publish': return DEFAULTS.confidence_thresholds.publish;
    case 'suggest_search': return DEFAULTS.confidence_thresholds.search;
    case 'browse_feed': return DEFAULTS.confidence_thresholds.browse_feed;
    default: return 1;
  }
}

function cooldownFor(action) {
  return DEFAULTS.cooldowns[`${action}_ms`] || 0;
}

function normalizeText(parts) {
  return parts.flat().filter(Boolean).join(' ').toLowerCase();
}

function matchRules(text, rules = []) {
  return rules.filter(rule => text.includes(rule.toLowerCase()));
}

/**
 * Evaluate a structured signal and return an action decision.
 *
 * @param {Object} input - { signal, confidence, topics, query, draft: { summary, body } }
 * @returns {Object} { action, candidate_action, allowed, reason, blocked_by, matched_prefs }
 */
export function evaluate(input) {
  const candidateAction = actionForSignal(input.signal);
  const confidence = input.confidence ?? 0;
  const reason = [];
  const blocked_by = [];
  const prefs = getPrefs();

  const text = normalizeText([
    input.signal, input.query,
    input.topics || [],
    input.draft?.summary, input.draft?.body,
  ]);

  const matched_prefs = {
    watch: matchRules(text, prefs.watch),
    no_watch: matchRules(text, prefs.no_watch),
    publish: matchRules(text, prefs.publish),
    no_publish: matchRules(text, prefs.no_publish),
  };

  if (candidateAction === 'no_action') {
    return {
      action: 'no_action', candidate_action: 'no_action',
      allowed: false, reason: ['unrecognized_signal'], blocked_by, matched_prefs,
    };
  }

  reason.push(`signal:${input.signal}`);

  if (confidence < thresholdFor(candidateAction)) {
    blocked_by.push('low_confidence');
  }

  if (state.isCoolingDown(candidateAction, cooldownFor(candidateAction))) {
    blocked_by.push('cooldown_active');
  }

  if (candidateAction === 'suggest_publish' && matched_prefs.no_publish.length > 0) {
    blocked_by.push('matched_no_publish_pref');
  }

  if ((candidateAction === 'suggest_search' || candidateAction === 'browse_feed') && matched_prefs.no_watch.length > 0) {
    blocked_by.push('matched_no_watch_pref');
  }

  if (candidateAction === 'suggest_publish' && !input.draft?.summary) {
    blocked_by.push('missing_draft_summary');
  }

  if (candidateAction === 'suggest_search' && !input.query && (!input.topics || input.topics.length === 0)) {
    blocked_by.push('missing_query_context');
  }

  if (matched_prefs.watch.length > 0) reason.push('matched_watch_pref');
  if (matched_prefs.publish.length > 0 && candidateAction === 'suggest_publish') reason.push('matched_publish_pref');

  return {
    action: blocked_by.length === 0 ? candidateAction : 'no_action',
    candidate_action: candidateAction,
    allowed: blocked_by.length === 0,
    reason,
    blocked_by,
    matched_prefs,
  };
}

/**
 * Record that an action was surfaced to the user (updates cooldown state).
 */
export function recordAction(action, meta = {}) {
  return state.record(action, meta);
}
