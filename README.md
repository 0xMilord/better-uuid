# better-uuid

> *Stop debugging IDs. Start reading them.*

**TypeScript-first, Rust-powered identifiers** compiled to WebAssembly. Treat IDs as **structured, inspectable values** — not opaque random strings.

**Status:** ✅ Phase 1 complete — Rust core with UUID v4 + UUID v7 strategies, full roundtrip parse, 39 Rust + 23 TS tests passing, 10k golden fixtures generated, collision model documented. Phase 2 (WASM bindings + TS `createId`/`parseId`) in progress.

---

## Why this exists

We kept debugging systems where IDs told us nothing. A UUID in a log means *"go query the database."* A prefixed, time-ordered, parseable ID means *"oh, that's a user record, created at 14:32, from the west region."*

So we made IDs that explain themselves.

---

## Try it now (no install)

```bash
npx better-uuid generate --prefix usr --strategy time
# → usr_01HZX7K2M3N4P5Q6R7S8T9V0W

npx better-uuid parse usr_01HZX7K2M3N4P5Q6R7S8T9V0W
# → { prefix: "usr", strategy: "time", createdAt: "2026-04-06T14:32:…", entropy: "…" }
```

That's the whole pitch. **IDs that are data, not dice rolls.**

---

## Before vs After

### Before (uuid / randomUUID)

```
reqId=8f14e45f-ceea-4667-a716-446655440000
```

What does that tell you? Nothing. You need a database lookup.

### After (better-uuid)

```
reqId=usr_01HZX7K2M3N4P5Q6R7S8T9V0W
```

```ts
parseId("usr_01HZX7K2M3N4P5Q6R7S8T9V0W");
// → {
//     prefix: "usr",
//     strategy: "time",
//     createdAt: "2026-04-06T14:32:11.234Z",
//     region: "in-west",       // when applicable
//     entropy: "a3f7c1…",
//     legacy: false
//   }
```

→ **type:** user
→ **createdAt:** 2026-04-06T14:32:…
→ **region:** in-west (when distributed mode is used)

No database lookup. No guessing. Just read the ID.

---

## Recommended default

If you don't want to think about strategies yet:

```ts
import { createId } from "better-uuid";

const id = createId({ strategy: "time", prefix: "entity" });
// → "entity_01HZX7K2M3N4P5Q6R7S8T9V0W"
```

**Time-ordered** (lex-sortable, good for DB indexes). **Prefixed** (entity type visible). **Parseable** (no DB lookup needed). This is the opinionated default we recommend for new projects.

---

## Guarantees (read this before using)

No marketing. Here's what can go wrong and what we actually promise:

| Guarantee | What it means |
|-----------|--------------|
| `uuidv4` → same collision class as `crypto.randomUUID()` | Correct CSPRNG, 122 random bits. Negligible collision risk. |
| Time IDs → monotonic lex order **unless** system clock regresses | Ordering is reliable on well-behaved clocks. NTP step-backs can reorder — we detect and let you choose policy (§ Failure modes). |
| Snowflake → **you** manage unique node+region config | We don't allocate nodes. Duplicate `(node, region)` = duplicate IDs. Your infra responsibility. |
| Deterministic → **NOT safe for public IDs if input space is small** | Hash of `"alice@example.com"` is guessable. Use salted hash or add entropy for public-facing IDs. |
| Old IDs always parse forward | `schemaVersion` byte in payload. Upgrading the library never breaks reading old IDs. |
| No silent quality degradation | If WASM fails to load, we fail **loud** with actionable error — never silently fall back to `Math.random()`. |

Full guarantee table: [PRD.md §5.0](PRD.md#50-guarantees-plain-language).

---


## Compared to alternatives

| Library | What it does | What it doesn't |
|---------|-------------|-----------------|
| **`uuid` / `crypto.randomUUID()`** | Standard random UUIDs | No ordering, no semantics, no parse |
| **UUID v7 (RFC)** | Time-ordered standard | No prefix, no semantics, no structured parse |
| **nanoid** | Short, random, configurable | Not sortable, not parseable, no structure |
| **ULID** | Sortable, Crockford base32 | No prefix, no semantics, no ecosystem compat |
| **Snowflake libs** | Distributed, time-leading | Varies by impl; no unified API, no parse standard |
| **better-uuid** | Structured, sortable, parseable, drop-in compat | Larger surface; WASM dependency (with JS fallback) |

**The difference:** every other library generates a string. We generate a **documented structure** you can inspect without a decoder ring.

---

## Quickstart

```ts
import { createId, parseId } from "better-uuid";

// Recommended: time-ordered + semantic prefix
const userId = createId({ prefix: "usr", strategy: "time" });
// → "usr_01HZX7K2M3N4P5Q6R7S8T9V0W"

parseId(userId);
// → { prefix: "usr", strategy: "time", timestamp: 1712345678901, entropy: "…", legacy: false }
```

### Switch from `uuid` (10 seconds)

```diff
- import { v4 as uuidv4 } from "uuid";
+ import { v4 as uuidv4 } from "better-uuid/compat/uuid";
```

### Switch from `nanoid` (10 seconds)

```diff
- import { nanoid } from "nanoid";
+ import { nanoid } from "better-uuid/compat/nanoid";
```

### Zero-touch bundler alias (entire codebase at once)

```js
// vite.config.js
export default {
  resolve: {
    alias: {
      uuid: "better-uuid/compat/uuid",
      nanoid: "better-uuid/compat/nanoid",
    },
  },
};
```

Same imports. Same behavior. Now you can progressively upgrade to `createId()` when ready. Full migration guide: [ADOPTION.md](ADOPTION.md).

---

## Failure modes (visible, not silent)

Snowflake-class generation can fail closed. Here's what it looks like:

```ts
const id = createId({
  strategy: "snowflake",
  node: 42,
  region: "in-west",
  onClockRegression: "fallback",   // "wait" | "error" | "fallback"
  onSequenceExhausted: "error",
});
```

If the OS clock stepped backward:

```json
{
  "warning": "Clock regression detected",
  "action": "Emitted uuidv4 fallback for this ID",
  "policy": "fallback",
  "node": 42,
  "region": "in-west"
}
```

**Never silent duplicates.** You choose the policy; we enforce it. Full failure mode docs: [PRD.md §7.1](PRD.md#71-failure-modes-and-operator-actions-normative).

---

## Upgrades (what happens when you update)

| Scenario | What happens |
|----------|-------------|
| Upgrade library from v1.2 → v1.3 | Old IDs parse. New IDs may include new `schemaVersion`. No breaking change. |
| Upgrade library from v1.x → v2.0 | `schemaVersion` bumps. Old IDs **still parse** — we add decoders, never remove them. |
| You generated IDs on v1, parse on v2 | Works. Forward-compatible by design. |
| You generated IDs on v2, parse on v1 | Fails closed with `UnsupportedStrategyVersion` — upgrade the reader. |

**Rule:** breaking wire-format changes = **major semver bump**. We never silently change decode behavior for existing versions.

---

## API overview

```ts
import { createId, parseId, defineId, withIdContext } from "better-uuid";

// Org-wide defaults (set once at bootstrap)
createId.configure({
  defaultStrategy: "time",
  prefixes: { user: "usr", order: "ord" },
  strict: true,
});

// Use everywhere — no per-call prefix spam
const userId = createId();            // → "usr_01HZX…" (auto-prefix from config)
const orderId = createId({ prefix: "ord" }); // → "ord_01HZY…"

// Request-scoped context (middleware sets once)
withIdContext({ requestId: "req_abc", sessionId: "sess_xyz" }, () => {
  // handlers call createId() — trace context flows through
});

// Parse anything — old UUIDs or new IDs
parseId("550e8400-e29b-41d4-a716-446655440000");
// → { strategy: "uuidv4", legacy: true, … }
```

---

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

---

## Local development

```bash
# Prerequisites: Rust stable (rustup), Node 22+, pnpm 10+
pnpm install

# Run everything: Rust fmt + clippy + test, TS typecheck + test
pnpm ci:all

# Or run individually:
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
pnpm typecheck
pnpm test
```

---

## Documentation

| Doc | Purpose |
|-----|--------|
| [📖 Docs site](https://better-uuid.github.io/better-uuid/) | **Start here:** static HTML docs with full API reference |
| [ADOPTION.md](ADOPTION.md) | Migration guide: hybrid IDs, uuid/nanoid drop-in, DB fear removal |
| [PRD.md](PRD.md) | Requirements, guarantees, UUID v7 comparison, failure modes |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Rust core, WASM, TS exports, compat layout |
| [ROADMAP.md](ROADMAP.md) | Phases, exit criteria, what ships when |
| [RELEASING.md](RELEASING.md) | Release cycle: `pnpm release`, GitHub Actions, rollback |
| [docs/formats.md](docs/formats.md) | Wire format spec, alphabet reference |
| [docs/collision-model.md](docs/collision-model.md) | Entropy analysis, birthday bounds, CSPRNG audit |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to propose changes and run CI locally |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting (private) |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community standards |
| [SUPPORT.md](SUPPORT.md) | Where to ask questions |
| [GOVERNANCE.md](GOVERNANCE.md) | Maintainer roles and decisions |

---

## Benchmarks (coming soon)

Performance targets and methodology will be published here once Phase 2 is complete. Goal: WASM path **at or faster than** `crypto.randomUUID()` for comparable entropy operations. Honest methodology — hardware, Node version, warmup, iteration count.

---

## License

[MIT](LICENSE).

---

*Stop generating random strings. Start generating useful IDs.*
