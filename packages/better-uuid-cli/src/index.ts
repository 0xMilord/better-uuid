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

import { createId, parseId } from "better-uuid";

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
  process.exit(1);
}

function parseArgs(remaining: string[]): Record<string, string | true> {
  const result: Record<string, string | true> = {};
  for (let i = 1; i < remaining.length; i++) {
    const arg = remaining[i];
    if (arg.startsWith("--")) {
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

switch (command) {
  case "generate": {
    const opts = parseArgs(args);
    const strategy = (opts.strategy as string) ?? "time";
    const prefix = opts.prefix as string | undefined;
    const count = typeof opts.count === "string" ? Number.parseInt(opts.count, 10) : 1;

    for (let i = 0; i < count; i++) {
      const id = createId({ strategy, prefix });
      if (count === 1) {
        // Single output: parse and show structured result
        console.log(id);
        const parsed = parseId(id);
        console.log(JSON.stringify(parsed, null, 2));
      } else {
        // Batch: just IDs
        console.log(id);
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
    const parsed = parseId(id);
    console.log(JSON.stringify(parsed, null, 2));
    break;
  }

  case "migrate": {
    // Phase 0 stub — full implementation in Phase 5
    console.warn("⚠️  migrate is not yet implemented. Available in Phase 5.");
    console.warn("   Track progress: ROADMAP.md § Phase 5");
    process.exit(0);
    break;
  }

  case "bench": {
    // Phase 0 stub — full implementation in Phase 2/5
    console.warn("⚠️  bench is not yet implemented. Available in Phase 2/5.");
    console.warn("   Track progress: ROADMAP.md § Phase 2, Phase 5");
    process.exit(0);
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    console.error("Run 'better-uuid' without arguments for usage.");
    process.exit(1);
}
