#!/usr/bin/env node

// ---------------------------------------------------------------------------
// better-uuid CLI — generate, parse, migrate, bench
//
// Usage:
//   npx better-uuid generate [--strategy time] [--prefix usr] [--count 10]
//   npx better-uuid parse <id>
//   npx better-uuid migrate [--write]
//   npx better-uuid bench [--compare uuid nanoid]
// ---------------------------------------------------------------------------

import { createId, parseId, isLegacyId, isWasm, init } from "better-uuid";

// Parse CLI arguments
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.error("Usage: better-uuid <command> [options]");
  console.error("");
  console.error("Commands:");
  console.error("  generate  Generate IDs (--strategy, --prefix, --count)");
  console.error("  parse     Parse an ID string");
  console.error("  migrate   Scan for legacy patterns (--write)");
  console.error("  bench     Benchmark vs uuid/nanoid (--compare)");
  console.error("");
  console.error("Options:");
  console.error("  --strategy <name>  uuidv4 | time | ulid | nanoid");
  console.error("  --prefix <str>     Semantic prefix (e.g. usr, ord)");
  console.error("  --count <n>        Number of IDs to generate");
  console.error("  --json             Output as JSON (generate/parse)");
  process.exit(1);
}

function parseArgs(remaining: string[]): Record<string, string | true> {
  const result: Record<string, string | true> = {};
  for (let i = 1; i < remaining.length; i++) {
    const arg = remaining[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const next = remaining[i + 1];
      if (next && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

// Format parse result for CLI output
function formatParseOutput(parsed: ReturnType<typeof parseId>): Record<string, unknown> {
  return {
    legacy: parsed.legacy,
    prefix: parsed.prefix ?? null,
    strategy: parsed.strategy,
    schemaVersion: parsed.schemaVersion ?? null,
    createdAt: parsed.timestampMs != null ? new Date(Number(parsed.timestampMs)).toISOString() : null,
    timestampMs: parsed.timestampMs != null ? Number(parsed.timestampMs) : null,
    entropy: parsed.entropy,
    nodeId: parsed.nodeId ?? null,
    region: parsed.region ?? null,
  };
}

switch (command) {
  case "generate": {
    const opts = parseArgs(args);
    const strategy = ((opts.strategy as string) ?? "time") as
      | "uuidv4"
      | "time"
      | "ulid"
      | "nanoid";
    const prefix = opts.prefix as string | undefined;
    const count = typeof opts.count === "string" ? Number.parseInt(opts.count, 10) : 1;
    const asJson = !!opts.json;

    const result = createId({ strategy, prefix, count });
    const ids = Array.isArray(result) ? result : [result];

    if (asJson) {
      const parsed = ids.map((id) => {
        try {
          return formatParseOutput(parseId(id));
        } catch {
          return { id, parseError: "Could not parse" };
        }
      });
      console.log(JSON.stringify(parsed, null, 2));
    } else {
      // Single output: ID + parse details
      if (ids.length === 1) {
        const id = ids[0]!;
        console.log(id);
        try {
          const parsed = parseId(id);
          console.log(JSON.stringify(formatParseOutput(parsed), null, 2));
        } catch (e) {
          console.error(`Parse error: ${(e as Error).message}`);
        }
      } else {
        // Batch: just IDs, one per line
        for (const id of ids) {
          console.log(id);
        }
      }
    }
    break;
  }

  case "parse": {
    const id = args[1];
    if (!id) {
      console.error("Usage: better-uuid parse <id>");
      process.exit(1);
    }
    try {
      const parsed = parseId(id);
      console.log(JSON.stringify(formatParseOutput(parsed), null, 2));
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }
    break;
  }

  case "migrate": {
    const opts = parseArgs(args);
    const write = !!opts.write;

    if (!write) {
      console.warn("⚠️  migrate --write is not yet implemented (Phase 5)");
      console.warn("   Track progress: ROADMAP.md § Phase 5");
      console.log("Found 0 legacy patterns (scan not implemented)");
      process.exit(0);
    } else {
      console.error("migrate --write: not yet implemented");
      process.exit(1);
    }
  }

  case "bench": {
    console.warn("⚠️  bench is not yet implemented (Phase 5)");
    console.warn("   Track progress: ROADMAP.md § Phase 5");
    process.exit(0);
  }

  default:
    console.error(`Unknown command: ${command}`);
    console.error("Run 'better-uuid' without arguments for usage.");
    process.exit(1);
}

// Log WASM status on startup (hidden unless verbose)
if (process.env.BETTER_UUID_VERBOSE) {
  init().then(() => {
    console.error(`Engine: ${isWasm() ? "WASM" : "JS fallback"}`);
  }).catch(() => {
    console.error("Engine: JS fallback (WASM init failed)");
  });
}
