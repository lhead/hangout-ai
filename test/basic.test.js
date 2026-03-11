/**
 * hangout-ai — basic tests
 *
 * Run: node test/basic.test.js
 */

import { evaluate } from '../src/policy.js';
import { validateDraft } from '../src/draft.js';
import { validateSourceDef } from '../src/backends/index.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

function test(name, fn) {
  console.log(`test: ${name}`);
  try {
    fn();
  } catch (err) {
    failed++;
    console.error(`  ERROR: ${err.message}`);
  }
}

// --- Policy tests ---

test('publish signal with high confidence → suggest_publish', () => {
  const result = evaluate({
    signal: 'problem_solved',
    confidence: 0.9,
    draft: { summary: 'Fixed bug', body: 'Details here.' },
  });
  assert(result.action === 'suggest_publish', `expected suggest_publish, got ${result.action}`);
  assert(result.allowed === true, 'expected allowed');
});

test('publish signal with low confidence → blocked', () => {
  const result = evaluate({
    signal: 'problem_solved',
    confidence: 0.3,
    draft: { summary: 'Fixed bug', body: 'Details here.' },
  });
  assert(result.allowed === false, 'expected blocked');
  assert(result.blocked_by.includes('low_confidence'), 'expected low_confidence in blocked_by');
});

test('publish signal without summary → blocked', () => {
  const result = evaluate({
    signal: 'problem_solved',
    confidence: 0.9,
    draft: { body: 'Details here.' },
  });
  assert(result.allowed === false, 'expected blocked');
  assert(result.blocked_by.includes('missing_draft_summary'), 'expected missing_draft_summary');
});

test('search signal → suggest_search', () => {
  const result = evaluate({
    signal: 'user_stuck',
    confidence: 0.8,
    query: 'typescript generics',
  });
  assert(result.action === 'suggest_search', `expected suggest_search, got ${result.action}`);
});

test('search signal without query/topics → blocked', () => {
  const result = evaluate({
    signal: 'user_stuck',
    confidence: 0.8,
  });
  assert(result.blocked_by.includes('missing_query_context'), 'expected missing_query_context');
});

test('feed signal → browse_feed', () => {
  const result = evaluate({
    signal: 'natural_pause',
    confidence: 0.7,
  });
  assert(result.action === 'browse_feed', `expected browse_feed, got ${result.action}`);
});

test('unrecognized signal → no_action', () => {
  const result = evaluate({
    signal: 'random_thing',
    confidence: 0.9,
  });
  assert(result.action === 'no_action', `expected no_action, got ${result.action}`);
  assert(result.reason.includes('unrecognized_signal'), 'expected unrecognized_signal');
});

// --- Draft validation tests ---

test('valid draft passes', () => {
  const result = validateDraft({
    summary: 'Fixed a bug in the parser',
    body: 'The parser was failing on nested objects because it did not handle recursive descent properly. Fixed by adding a stack-based approach.',
  });
  assert(result.valid === true, 'expected valid');
  assert(result.errors.length === 0, 'expected no errors');
});

test('missing summary → error', () => {
  const result = validateDraft({ body: 'Some body text that is long enough.' });
  assert(result.valid === false, 'expected invalid');
  assert(result.errors.includes('summary_required'), 'expected summary_required');
});

test('missing body → error', () => {
  const result = validateDraft({ summary: 'A title' });
  assert(result.valid === false, 'expected invalid');
  assert(result.errors.includes('body_required'), 'expected body_required');
});

test('detects email in draft', () => {
  const result = validateDraft({
    summary: 'Test',
    body: 'Contact me at user@example.com for details about the implementation. This is a longer body to avoid thin warning.',
  });
  assert(result.redactions.some(r => r.type === 'email'), 'expected email detection');
  assert(result.warnings.includes('possible_sensitive_data'), 'expected sensitive data warning');
});

test('detects github token in draft', () => {
  const result = validateDraft({
    summary: 'Test',
    body: 'Use token ghp_1234567890abcdefghij to authenticate with the API. This body is long enough to pass validation.',
  });
  assert(result.redactions.some(r => r.type === 'github_token'), 'expected github_token detection');
});

test('detects absolute path in draft', () => {
  const result = validateDraft({
    summary: 'Test',
    body: 'File is at /Users/someone/projects/secret/main.js — you should check it out for the implementation details.',
  });
  assert(result.redactions.some(r => r.type === 'absolute_path'), 'expected absolute_path detection');
});

test('warns on long summary', () => {
  const result = validateDraft({
    summary: 'A'.repeat(81),
    body: 'This is a body that is long enough to pass validation without triggering the thin body warning for completeness.',
  });
  assert(result.warnings.includes('summary_over_80_chars'), 'expected summary_over_80_chars');
});

test('warns on thin body', () => {
  const result = validateDraft({ summary: 'Test', body: 'Short.' });
  assert(result.warnings.includes('body_is_thin'), 'expected body_is_thin');
});

// --- Backend validation tests ---

test('github backend requires repo', () => {
  let threw = false;
  try {
    validateSourceDef({ backend: 'github' });
  } catch (e) {
    threw = true;
    assert(e.message.includes('--repo'), 'expected error about --repo');
  }
  assert(threw, 'expected validation to throw');
});

test('unknown backend rejected', () => {
  let threw = false;
  try {
    validateSourceDef({ backend: 'gitlab' });
  } catch (e) {
    threw = true;
    assert(e.message.includes('Unknown backend'), 'expected unknown backend error');
  }
  assert(threw, 'expected validation to throw');
});

test('valid github source passes', () => {
  let threw = false;
  try {
    validateSourceDef({ backend: 'github', repo: 'owner/repo' });
  } catch {
    threw = true;
  }
  assert(!threw, 'expected no error for valid source');
});

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
