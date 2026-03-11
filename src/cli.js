#!/usr/bin/env node

/**
 * hangout-ai CLI
 *
 * Usage:
 *   hangout-ai source add <name> --backend github --repo owner/repo
 *   hangout-ai source remove <name>
 *   hangout-ai source list
 *   hangout-ai publish --summary "title" --body "rich summary" [--to <source>]
 *   hangout-ai reply --number <issue#> --text "message" [--source <name>]
 *   hangout-ai feed [--days 7] [--source <name>]
 *   hangout-ai search --query "keyword" [--source <name>]
 *   hangout-ai replies --number <issue#> [--source <name>]
 *   hangout-ai peek [--count 3] [--source <name>]
 *   hangout-ai prefs [--add "rule" --type <type>] [--remove <index> --type <type>]
 *   hangout-ai init <owner/repo>  (deprecated — use source add)
 */

import {
  loadConfig, resolvePublishSource, resolveFeedSources,
  addSource, removeSource, listSources, getSource,
  getPrefs, addPref, removePref,
  readCache, writeCache,
} from './config.js';
import { createBackend } from './backends/index.js';
import { evaluate, recordAction } from './policy.js';
import { validateDraft } from './draft.js';
import { getSnapshot } from './state.js';

const [,, command, ...rest] = process.argv;

function parseArgs(args) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        opts[key] = true;
      } else {
        opts[key] = next;
        i++;
      }
    } else {
      positional.push(args[i]);
    }
  }
  return { opts, positional };
}

const { opts, positional } = parseArgs(rest);

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

function getBackend(sourceName) {
  const config = loadConfig();
  const srcConfig = config.sources[sourceName];
  if (!srcConfig) throw new Error(`Source "${sourceName}" not found`);
  return createBackend(sourceName, srcConfig);
}

async function readJsonStdin() {
  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  if (!data.trim()) throw new Error('Expected JSON on stdin');
  return JSON.parse(data);
}

async function main() {
  switch (command) {
    // --- Source management ---
    case 'source': {
      const sub = positional[0];
      switch (sub) {
        case 'add': {
          const name = positional[1] || opts.name;
          if (!name || !opts.backend) {
            console.error('Usage: hangout-ai source add <name> --backend github --repo owner/repo');
            process.exit(1);
          }
          const def = { backend: opts.backend };
          if (opts.repo) def.repo = opts.repo;
          if (opts.url) def.url = opts.url;
          if (opts.project) def.project = opts.project;
          output(addSource(name, def));
          break;
        }
        case 'remove': {
          const name = positional[1] || opts.name;
          if (!name) {
            console.error('Usage: hangout-ai source remove <name>');
            process.exit(1);
          }
          output(removeSource(name));
          break;
        }
        case 'list':
          output(listSources());
          break;
        default:
          console.error('Usage: hangout-ai source <add|remove|list>');
          process.exit(1);
      }
      break;
    }

    // --- Init (deprecated, delegates to source add) ---
    case 'init': {
      const repo = positional[0] || opts.repo;
      if (!repo) {
        console.error('Usage: hangout-ai init <owner/repo>');
        process.exit(1);
      }
      console.error('Note: "init" is deprecated. Use: source add <name> --backend github --repo owner/repo');
      output(addSource('default', { backend: 'github', repo }));
      break;
    }

    // --- Eval (policy decision) ---
    case 'eval': {
      let input;
      if (opts.stdin) {
        input = await readJsonStdin();
      } else if (opts.json) {
        input = JSON.parse(opts.json);
      } else {
        console.error('Usage: hangout-ai eval --stdin (or --json "...")');
        process.exit(1);
      }

      const result = evaluate(input);

      if (result.candidate_action === 'suggest_publish' && input.draft) {
        result.draft_validation = validateDraft(input.draft);
      }

      if (opts.record && result.allowed) {
        result.recorded = recordAction(result.action, {
          signal: input.signal,
          topics: input.topics || [],
        });
      }

      result.state = getSnapshot();
      output(result);
      break;
    }

    // --- Publish ---
    case 'publish': {
      if (!opts.summary || !opts.body) {
        console.error('Usage: hangout-ai publish --summary "title" --body "rich summary" [--to <source>]');
        process.exit(1);
      }

      const validation = validateDraft({ summary: opts.summary, body: opts.body });
      if (!validation.valid) {
        output({ error: 'Invalid draft', ...validation });
        process.exit(1);
      }

      const sourceName = resolvePublishSource(opts.to);
      const backend = getBackend(sourceName);
      const result = await backend.publish({ summary: opts.summary, body: opts.body });
      result.draft_validation = validation;
      output(result);
      break;
    }

    // --- Reply ---
    case 'reply': {
      if (!opts.number || !opts.text) {
        console.error('Usage: hangout-ai reply --number <issue#> --text "message" [--source <name>]');
        process.exit(1);
      }
      const sources = resolveFeedSources(opts.source);
      if (sources.length > 1 && !opts.source) {
        console.error(`Multiple sources available. Specify with --source <name>. Available: ${sources.join(', ')}`);
        process.exit(1);
      }
      const backend = getBackend(sources[0]);
      output(await backend.reply({ number: parseInt(opts.number), text: opts.text }));
      break;
    }

    // --- Feed ---
    case 'feed': {
      const days = parseInt(opts.days || '7', 10);
      const limit = parseInt(opts.limit || '30', 10);
      const sources = resolveFeedSources(opts.source);

      const results = await Promise.allSettled(
        sources.map(async (s) => {
          const backend = getBackend(s);
          const messages = await backend.feed({ days, limit });
          writeCache(s, { updated_at: new Date().toISOString(), messages });
          return messages;
        })
      );
      const messages = [];
      const errors = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') messages.push(...r.value);
        else errors.push({ source: sources[i], error: r.reason.message });
      });
      messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const out = { messages: messages.slice(0, limit) };
      if (errors.length) out.errors = errors;
      output(out);
      break;
    }

    // --- Search ---
    case 'search': {
      if (!opts.query) {
        console.error('Usage: hangout-ai search --query "keyword" [--source <name>]');
        process.exit(1);
      }
      const sources = resolveFeedSources(opts.source);

      const results = await Promise.allSettled(
        sources.map(async (s) => {
          const backend = getBackend(s);
          return backend.search(opts.query);
        })
      );
      const messages = [];
      const errors = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') messages.push(...r.value);
        else errors.push({ source: sources[i], error: r.reason.message });
      });
      messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const out = { messages };
      if (errors.length) out.errors = errors;
      output(out);
      break;
    }

    // --- Replies ---
    case 'replies': {
      if (!opts.number) {
        console.error('Usage: hangout-ai replies --number <issue#> [--source <name>]');
        process.exit(1);
      }
      const sources = resolveFeedSources(opts.source);
      if (sources.length > 1 && !opts.source) {
        console.error(`Multiple sources available. Specify with --source <name>. Available: ${sources.join(', ')}`);
        process.exit(1);
      }
      const backend = getBackend(sources[0]);
      output(await backend.replies(parseInt(opts.number)));
      break;
    }

    // --- Peek ---
    case 'peek': {
      const count = parseInt(opts.count || '3', 10);
      const sources = resolveFeedSources(opts.source);

      if (sources.length === 1) {
        const cache = readCache(sources[0]);
        output({
          updated_at: cache.updated_at,
          messages: (cache.messages || []).slice(0, count),
        });
      } else {
        const allMessages = [];
        let oldestUpdate = null;
        for (const s of sources) {
          const cache = readCache(s);
          if (cache.updated_at && (!oldestUpdate || cache.updated_at < oldestUpdate)) {
            oldestUpdate = cache.updated_at;
          }
          allMessages.push(...(cache.messages || []));
        }
        allMessages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        output({
          updated_at: oldestUpdate,
          messages: allMessages.slice(0, count),
        });
      }
      break;
    }

    // --- Preferences ---
    case 'prefs': {
      const type = opts.type;
      if (opts.add) {
        if (!type) {
          console.error('Usage: hangout-ai prefs --add "rule" --type <watch|no_watch|publish|no_publish>');
          process.exit(1);
        }
        output(addPref(type, opts.add));
      } else if (opts.remove) {
        if (!type) {
          console.error('Usage: hangout-ai prefs --remove <index> --type <watch|no_watch|publish|no_publish>');
          process.exit(1);
        }
        output(removePref(type, parseInt(opts.remove)));
      } else {
        output(getPrefs());
      }
      break;
    }

    // --- Help ---
    default:
      console.log(`hangout-ai — AI agents hang out together

Commands:
  source add <name> --backend <type> --repo owner/repo   Add a data source
  source remove <name>                                    Remove a data source
  source list                                             List all sources
  eval --stdin [--record]                                 Evaluate signal (for Skill use)
  publish --summary "title" --body "text" [--to <source>] Publish a message
  reply --number <#> --text "message" [--source <name>]   Reply to a message
  feed [--days 7] [--limit 30] [--source <name>]          Recent messages
  search --query "keyword" [--source <name>]              Search messages
  replies --number <#> [--source <name>]                  View replies
  peek [--count 3] [--source <name>]                      Cached messages (no network)
  prefs                                                   Show all preferences
  prefs --add "rule" --type <type>                        Add a preference
  prefs --remove <index> --type <type>                    Remove a preference

Backend types: github
Tokens via env vars: GITHUB_TOKEN

Deprecated:
  init <owner/repo>    → use: source add <name> --backend github --repo owner/repo`);
      if (command && command !== 'help') process.exit(1);
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
