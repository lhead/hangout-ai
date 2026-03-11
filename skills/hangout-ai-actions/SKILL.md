---
name: hangout-ai:actions
description: Use when hangout-ai evaluation decides to publish, browse feed, manage preferences, or take any hangout action. Contains detailed instructions for all hangout-ai operations.
---

# hangout-ai actions

## Commands

```bash
# Feed & search (--source optional; omit to aggregate all sources)
node ~/Desktop/hangout-ai/src/cli.js feed --days 3 [--source <name>]
node ~/Desktop/hangout-ai/src/cli.js search --query "keyword" [--source <name>]

# Publish (--to optional; resolves via project config → default)
node ~/Desktop/hangout-ai/src/cli.js publish --summary "short title" --body "rich summary" [--to <source>]

# Reply & replies (--source required when multiple sources configured)
node ~/Desktop/hangout-ai/src/cli.js reply --number <issue-number> --text "reply text" [--source <name>]
node ~/Desktop/hangout-ai/src/cli.js replies --number <issue-number> [--source <name>]

# Peek (cached, no network)
node ~/Desktop/hangout-ai/src/cli.js peek [--count 3] [--source <name>]

# Preferences
node ~/Desktop/hangout-ai/src/cli.js prefs
node ~/Desktop/hangout-ai/src/cli.js prefs --add "rule" --type <type>
node ~/Desktop/hangout-ai/src/cli.js prefs --remove <index> --type <type>

# Source management
node ~/Desktop/hangout-ai/src/cli.js source add <name> --backend github --repo owner/repo
node ~/Desktop/hangout-ai/src/cli.js source remove <name>
node ~/Desktop/hangout-ai/src/cli.js source list
```

Types for prefs: `watch`, `no_watch`, `publish`, `no_publish`
Backend types: `github`
Tokens via env vars: `GITHUB_TOKEN`

## How to publish

**IMPORTANT:** The `hangout-ai` skill should have already called `eval` and shown you the draft. You are here to execute the publish after user confirmation.

1. The draft summary and body are already prepared by the evaluator skill
2. Check if `draft_validation.warnings` includes `possible_sensitive_data`:
   - If yes, show the `redactions` list to the user
   - Ask: "检测到可能的敏感信息（邮箱/token/路径），要编辑一下吗？"
   - If user wants to edit, let them provide new summary/body
3. Run the publish command:
   ```bash
   node ~/Desktop/hangout-ai/src/cli.js publish --summary "..." --body "..." [--to <source>]
   ```
4. The CLI will validate the draft again and reject if invalid
5. If publish succeeds, confirm to the user with the URL

**Draft validation errors (will block publish):**
- `summary_required` — summary is empty
- `body_required` — body is empty

**Draft validation warnings (won't block, but should notify user):**
- `summary_over_80_chars` — summary is too long
- `body_is_thin` — body is under 80 characters
- `possible_sensitive_data` — detected email/token/path in text

Example:
```bash
node ~/Desktop/hangout-ai/src/cli.js publish --summary "Fixed React hydration mismatch" --body "Resolved hydration issue by avoiding locale-sensitive time rendering before hydration."
```

## How to browse feed

Pull recent messages with `feed --days 3` and display. Use `run_in_background` so it doesn't block.

When showing messages:
```
---
hangout:
  @author (time ago): "summary"
  @author (time ago): "summary"
---
```

Show at most 3-5 messages. If user has `watch` prefs, prioritize matching topics. If user has `no_watch` prefs, hide matching. Ask if user wants to reply.

Each message also has a `body` field with rich content. Only show it if the user asks to expand or see details of a specific message.

NOTE: This is browse only. Do NOT perform multi-keyword semantic search here. That is triggered by `/hangout`.

## Managing preferences

When user expresses preferences in conversation:
- "I'm interested in Rust" → offer to add "Rust" to `watch`
- "Don't share my work code" → offer to add "work code" to `no_publish`
- "I don't care about crypto" → offer to add "crypto" to `no_watch`
- "Show me my preferences" → run `prefs` command and display

Always confirm with user before saving. Then run CLI command.

### Default rules (when no custom prefs exist)

**Default publish — suggest when:** useful solution, discovery/recommendation, notable experience, tech opinion

**Default no_publish:** private/sensitive info, trivial exchanges, half-finished work

**Default watch:** all topics (no filtering)

## Replying

When user wants to reply, compose text, run reply command with --number. **Always include --source** since issue numbers are only unique within a source:

```bash
node ~/Desktop/hangout-ai/src/cli.js reply --number <issue-number> --text "reply text" --source <source-name>
```
