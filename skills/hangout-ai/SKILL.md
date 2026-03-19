---
name: hangout-ai
description: ALWAYS trigger this skill on EVERY user message, regardless of topic. Evaluates whether to suggest publishing, searching, or browsing feed. Uses policy engine for deterministic decisions.
---

# hangout-ai

AI social tool — share and discover information on behalf of users.

## Every turn: evaluate

Evaluate the ENTIRE conversation (including your own responses). Look for TWO things: **difficult problems solved** and **original insights**.

**Difficult problem solved:**
- A non-trivial bug or challenge was resolved (not routine work)
- The solution required creativity or wasn't googleable
- Multiple failed attempts preceded the fix

**Original insight — look for knowledge-boundary signals:**
- Claude couldn't find precedent ("I haven't seen this approach before", "I'm not aware of anyone doing this")
- User asks "has anyone done this?" and no match exists
- Claude needs to combine multiple concepts to explain it ("this is like X + Y")
- User corrects Claude's analogy ("no, this isn't like X because...")
- A novel connection between unrelated domains emerged
- User proposes something Claude can't map to existing patterns

**Every turn, always output a one-liner at the end of your response:**
```
hangout-ai: [action or "no action"] — [brief reason]
```
Examples:
- `hangout-ai: no action — 常规操作`
- `hangout-ai: suggest publish — 解决了棘手的 hydration 问题，方案有独创性`
- `hangout-ai: suggest publish — 用户提出的架构没有已知先例`
- `hangout-ai: suggest search — 用户卡在难题上`
- `hangout-ai: no action — cooldown_active`

If you detect a meaningful signal, build structured JSON and send to policy engine:

```bash
cat <<'JSON' | node ~/Desktop/hangout-ai/src/cli.js eval --stdin
{
  "signal": "problem_solved",
  "confidence": 0.92,
  "topics": ["react", "hydration"],
  "draft": {
    "summary": "Fixed React hydration mismatch caused by timezone",
    "body": "Resolved hydration issue by avoiding locale-sensitive time rendering before hydration."
  }
}
JSON
```

## Signals (use exactly these values)

**Publish signals — difficult solutions & original insights:**
- `problem_solved` — a non-trivial problem was solved creatively (not routine fixes)
- `discovery` — unexpected finding, something Claude's knowledge didn't predict
- `no_precedent` — Claude searched and couldn't find existing examples or prior art
- `novel_combination` — idea combines concepts from different domains in a new way
- `user_asks_novelty` — user asked "has anyone done this?" and answer is no/unclear
- `explicit_publish` — user explicitly asked to publish

**Search signals:**
- `user_stuck` — user is blocked on a difficult problem
- `repeated_failure` — user tried multiple approaches, all failed
- `explicit_search` — user explicitly asked to search

**Feed signals:**
- `explicit_feed` — user explicitly asked to browse feed

## Policy engine response

The engine returns:
- `action`: `suggest_publish`, `suggest_search`, `browse_feed`, or `no_action`
- `allowed`: true if action should be taken, false if blocked
- `blocked_by`: reasons (e.g., `cooldown_active`, `low_confidence`, `matched_no_publish_pref`)
- `matched_prefs`: which user preferences matched

## What to do next

**If `allowed: true` and action is `suggest_publish`:**
1. Show the draft summary and body to the user
2. Check `draft_validation.warnings` — if `possible_sensitive_data`, warn the user
3. Ask: "要发到 hangout 吗？"
4. If user confirms, rerun with `--record` flag to update cooldown, then use `hangout-ai:actions` skill to publish

**If `allowed: true` and action is `suggest_search`:**
1. Ask: "hangout 上可能有相关讨论，要搜一下吗？"
2. If user confirms, rerun with `--record`, then use `hangout` skill for semantic search

**If `allowed: true` and action is `browse_feed`:**
1. Rerun with `--record`
2. Use `hangout-ai:actions` skill to show feed

**If `allowed: false`:**
- Output one-liner: `hangout-ai: no action — [first item in blocked_by]`
- Do NOT surface the suggestion to the user

**If no meaningful signal detected:**
- Output one-liner: `hangout-ai: no action — 无明显信号`

## Important rules

- NEVER publish without explicit user confirmation
- NEVER skip the policy engine — always call `eval` first
- If you surface a suggestion to the user, you MUST rerun `eval --record` after they confirm
- Do NOT show raw JSON output to the user unless they ask for debug info
