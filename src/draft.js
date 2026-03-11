/**
 * hangout-ai — Draft validation and sensitive data detection
 *
 * Validates publish drafts before they go out:
 *   - Required fields (summary, body)
 *   - Length checks
 *   - Regex scan for emails, tokens, absolute paths
 */

const SENSITIVE_PATTERNS = [
  { type: 'email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: 'github_token', regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { type: 'openai_key', regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { type: 'absolute_path', regex: /(?:\/Users\/[^\s]+|[A-Z]:\\[^\s]+)/g },
];

function detectSensitiveData(text) {
  const hits = [];
  for (const pattern of SENSITIVE_PATTERNS) {
    const matches = text.match(pattern.regex);
    if (matches?.length) {
      hits.push({ type: pattern.type, count: matches.length, sample: matches[0] });
    }
  }
  return hits;
}

/**
 * Validate a publish draft.
 *
 * @param {Object} draft - { summary, body }
 * @returns {Object} { valid, errors, warnings, redactions }
 */
export function validateDraft({ summary, body }) {
  const errors = [];
  const warnings = [];

  if (!summary?.trim()) errors.push('summary_required');
  if (!body?.trim()) errors.push('body_required');

  if (summary && summary.length > 80) warnings.push('summary_over_80_chars');
  if (body && body.trim().length < 80) warnings.push('body_is_thin');

  const redactions = detectSensitiveData(`${summary || ''}\n${body || ''}`);
  if (redactions.length > 0) warnings.push('possible_sensitive_data');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    redactions,
  };
}
