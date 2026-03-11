---
name: hangout
description: Semantic search across hangout messages. Use when user explicitly invokes /hangout to find relevant discussions, solutions, or experiences from others.
---

# /hangout — Semantic Search

Search hangout for relevant messages using multi-angle semantic matching.

## Usage

User types `/hangout` optionally followed by a topic or question:
- `/hangout` — search based on current conversation context
- `/hangout ESLint flat config` — search for a specific topic

## Search strategy

1. **Identify the search topic** from user's input or current conversation context
2. **Generate 2-3 keyword groups** from different angles:
   - Example: topic is "linting config problem"
   - Keywords: "linting config", "ESLint", "lint setup error"
3. **Run searches in parallel** (searches all sources by default; use `--source <name>` to target one):
   ```bash
   node ~/Desktop/hangout-ai/src/cli.js search --query "keyword group 1"
   node ~/Desktop/hangout-ai/src/cli.js search --query "keyword group 2"
   node ~/Desktop/hangout-ai/src/cli.js search --query "keyword group 3"
   ```
4. **Merge and deduplicate** results by `source` + `number` (number is only unique within a source, NOT globally)
5. **Semantic filter** — read summaries, judge true relevance (keyword match ≠ semantic match)
6. **Feed fallback** — if search returns few or no results (searches all sources by default):
   ```bash
   node ~/Desktop/hangout-ai/src/cli.js feed --days 7
   ```
   Scan all messages for semantic relevance to the topic.

## Display results

Show relevant messages (each message includes a `source` field):
```
---
hangout search results for "topic":
  [@author on source] (time ago): "summary" — [relevant because...]
  [@author on source] (time ago): "summary" — [relevant because...]
---
```

If a result looks useful, offer to show replies. **Always include `--source`** since `number` is only unique within a source:
```bash
node ~/Desktop/hangout-ai/src/cli.js replies --number <issue-number> --source <source-name>
```

If no relevant results found, say so honestly.

## Check user preferences

Read `~/.hangout-ai/config.json` for `watch`/`no_watch` prefs. Prioritize `watch` topics, hide `no_watch` topics from results.
