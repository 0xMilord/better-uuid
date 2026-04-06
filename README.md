# better-uuid

> *Stop debugging IDs. Start reading them.*

**TypeScript-first, Rust-powered identifiers** compiled to WebAssembly. Treat IDs as **structured, inspectable values** — not opaque random strings.

**Status:** 🚧 Planning phase — not yet published to npm. Track progress in the docs below.

---

## Quickstart (preview)

```ts
import { createId, parseId } from "better-uuid";

const userId = createId({ prefix: "usr", strategy: "time" });
// → "usr_01HZX7K2M3N4P5Q6R7S8T9V0W"

parseId(userId);
// → { prefix: "usr", strategy: "time", timestamp: 1712345678901, entropy: "…", legacy: false }
```

## Why not just UUID v7?

| Capability | UUID v7 (RFC) | better-uuid |
|------------|----------------|-------------|
| Time-ordered (lex sort ≈ create time) | ✅ | ✅ |
| Prefix / entity semantics (`usr_`, `ord_`) | ❌ | ✅ |
| Structured `parseId` | ❌ | ✅ |
| Deterministic / idempotency key mode | ❌ | ✅ |
| Optional trace binding (OTEL-optional) | ❌ | ✅ |
| Drop-in compat with `uuid`/`nanoid` | N/A | ✅ |

We're not replacing the RFC — we're **standardizing how apps wrap and explain IDs** in logs, DBs, and traces.

## Emotional hooks (pain-native)

- *Your logs shouldn't require a database lookup.*
- *Switch from uuid/nanoid in under 5 minutes — without a rewrite.* (See [ADOPTION.md](ADOPTION.md).)

## Documentation

| Doc | Purpose |
|-----|--------|
| [ADOPTION.md](ADOPTION.md) | **Start here for migration:** hybrid IDs, uuid/nanoid drop-in, DB fear removal |
| [PRD.md](PRD.md) | Requirements, guarantees, UUID v7 comparison, failure modes |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Rust core, WASM, TS exports, compat layout |
| [ROADMAP.md](ROADMAP.md) | Phases, exit criteria, CLI + migrate |

## Benchmarks (coming soon)

Performance targets and methodology will be published here once Phase 2 is complete. Goal: WASM path **at or faster than** `crypto.randomUUID()`.

## License

TBD by maintainers.

---

*Stop generating random strings. Start generating useful IDs.*
