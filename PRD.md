# better-uuid — Product Requirements Document (PRD)

**Version:** 0.2 (planning)  
**Last updated:** 2026-04-06  
**Status:** Pre-implementation — defines scope, constraints, and measurable outcomes.

**Doc set:** `PRD.md` (this file), `ARCHITECTURE.md`, `ROADMAP.md`, `ADOPTION.md` (migration + drop-in).

---

## 1. Executive summary

**better-uuid** is a small SDK (TypeScript-first, Rust-powered core compiled to WebAssembly) that treats identifiers as **structured, inspectable values** rather than opaque random strings.

**One-line positioning:** *IDs you can read, sort, trace, and trust.*

**Not a goal:** Being "another fast UUID v4 wrapper" with no structural benefits.

---

## 2. Problem statement

### 2.1 Pain points (production-grounded)

| Pain | What breaks | What users need |
|------|-------------|-----------------|
| Opaque IDs | Logs and support tickets are guesswork | Prefix + parseable payload (type, time hints) |
| Random UUID v4 ordering | Index churn, painful keyset pagination | Time-ordered primary keys (ULID / UUID v7 class) |
| Format zoo per service | No log correlation | One library + optional schema registry patterns |
| Manual trace context | Broken request/session chains | Optional trace/session embedding in ID generation path |
| Determinism gaps | Cache keys and idempotency drift | Stable IDs from stable inputs |
| Distributed paranoia | Extra ID services, latency | Collision-safe node/region-aware encoding (snowflake-class) |

### 2.2 Target users

1. **Backend / platform engineers** (Node, Edge, browser workers) who own logging, DB design, and API contracts.  
2. **Full-stack SaaS builders** who want Stripe-style prefixed IDs without bespoke tooling.  
3. **Teams standardizing** ID formats across services after UUID v4 + nanoid chaos.

### 2.3 Non-target users (v1)

- Teams that **require strict RFC 4122-only** storage with no custom lexical form (they may still use internal `uuidv7` strategy and serialize to canonical form).  
- Environments that **cannot load WASM** and refuse a documented pure-JS fallback path.

---

## 3. Product principles

1. **Inspectable by default:** Every emitted ID should be parseable into a documented structure (prefix, strategy, timestamp where applicable, entropy, optional metadata slots).  
2. **Sort-friendly option:** A first-class `strategy: "time"` (or equivalent) that approximates creation order in lexicographic sort.  
3. **Zero ceremony install:** Works in Node, modern bundlers, Edge runtimes via WASM bundle; optional pure JS fallback.  
4. **Tree-shakable surface:** Pay only for strategies and helpers you import.  
5. **No native addon requirement in v1:** N-API / native acceleration is explicitly out of scope until post-traction.

---

## 4. Positioning & messaging (non-BS)

**Primary tagline:** *Stop generating random strings. Start generating useful IDs.*

**Elevator (technical):** *better-uuid turns identifiers from noise into signals: type, time order, and optional trace context—without a central ID server.*

**Avoid on the homepage:** "Rust-powered," "paradigm," "identity plane" without technical backing. Lead with outcomes (debuggability, sort, trace).

### 4.1 Emotional hooks (pain-native)

These are intentional lines for README/landing—grounded in what breaks in prod:

- *Stop debugging IDs. Start reading them.*
- *Your logs shouldn't require a database lookup.*
- *Switch from uuid/nanoid in under 5 minutes—without a rewrite.* (See `ADOPTION.md`.)

### 4.2 Adoption positioning (effortless switch)

**Principle:** Do not ask teams to change behavior on day one—**hijack existing call sites** (`randomUUID`, `uuid`, `nanoid`) via documented compat entrypoints and bundler aliases, then **progressively** add prefixes, trace, and schemas. Product is three layers: **Layer 1** drop-in compat → **Layer 2** `createId()` upgrades → **Layer 3** schemas / trace / distributed. Forcing Layer 3 first tanks adoption.

---

## 5. Scope

### 5.0 Guarantees (plain language)

Engineers should not hunt the repo for collision and ordering semantics. **Per-strategy guarantees** (wording is normative intent; exact bit-strength numbers ship in technical appendices):

| Strategy | Collision risk (practical) | Lexicographic time order | Deterministic | Notes |
|----------|----------------------------|---------------------------|---------------|--------|
| `uuidv4` | Negligible under correct CSPRNG | No | No | Same class as `crypto.randomUUID()`. |
| `time` / UUID v7–class | Negligible (entropy + time) | Yes, within documented clock monotonicity | No | Ordering can break if OS clock steps backward—see §7.1. |
| `ulid`-style / `nanoid`-style | Negligible at documented length | ULID yes; nano depends on option | No | Document effective entropy per alphabet + length. |
| `snowflake` / distributed | Negligible within node+sequence uniqueness rules | Yes (time-leading) | No | Depends on unique `(region, node)` allocation. |
| `deterministic` (hash of input) | **Depends on input space**; hash collision per algorithm | No | Yes | **Not** for public guessing resistance when input is small or enumerable. |

**Trust rule:** Any strategy that claims "negligible" collision risk must cite **entropy bits**, **birthday bound**, and **CSPRNG** source in technical docs.

### 5.0.1 "Why not just UUID v7?" (objection killer)

UUID v7 solves **time ordering** in a standard shape. It does **not** solve semantic clarity, org-wide schema discipline, deterministic dedupe, trace correlation in the ID surface, or one-line parse for ops.

| Capability | UUID v7 (RFC) | better-uuid |
|------------|----------------|-------------|
| Time-ordered (lex sort ≈ create time) | Yes | Yes (per strategy spec) |
| Prefix / entity semantics in string | No | Yes (`usr_`, `ord_`, …) |
| Structured `parseId` | No | Yes |
| Deterministic / idempotency key mode | No | Yes |
| Optional trace binding in generation path | No | Yes (v1.x OTEL-optional) |
| Drop-in compat with uuid/nanoid call sites | N/A | Yes (`ADOPTION.md`) |

We are not "replacing the RFC." We are **standardizing how apps wrap and explain IDs** in logs, DBs, and traces—while still allowing RFC outputs when required.

### 5.1 Strategy name mapping (canonical reference)

To avoid confusion between user-facing API names, Rust trait names, and PRD requirement IDs, this table is **normative**:

| PRD §5.0 row | User-facing `strategy` string | Rust trait (`ARCHITECTURE.md` §4.1) | Notes |
|--------------|-------------------------------|--------------------------------------|-------|
| `uuidv4` | `"uuidv4"` | `RandomV4` | RFC 4122 random |
| `time` | `"time"` | `TimeOrdered` | UUID v7–class; lex-sortable |
| `ulid`-style | `"ulid"` | `UlidLike` | Crockford base32, time-leading |
| `nanoid`-style | `"nanoid"` | `NanoLike` | Configurable length/alphabet |
| `snowflake` | `"snowflake"` | `Snowflake` | Distributed, node+region |
| `deterministic` | `"deterministic"` | `Deterministic` | Hash of canonical input |
| *(custom)* | *(user-defined)* | `IdStrategy` impl | Encode/decode contract; see §5.2 |

### 5.2 MVP (v1) — must ship

| ID | Requirement | Acceptance criteria |
|----|----------------|----------------------|
| R1 | **`createId()`** with defaults | Produces documented string format; documented collision model per strategy. |
| R2 | **Pluggable strategies** | At minimum: `uuidv4`, `uuidv7` (or binary-compatible time-ordered UUID), `ulid`-style, `nanoid`-style short IDs, **custom schema** hook (encode/decode contract). |
| R3 | **Time-ordered IDs** | `createId({ strategy: "time" })` sorts lexicographically ~by creation time within documented clock skew assumptions. |
| R4 | **Prefix system** | `createId({ prefix: "usr" })` yields `usr_…` (or documented separator); prefix validated (charset, **hard max length**, reserved list—see §5.7). |
| R5 | **Deterministic IDs** | `createId({ input: "<string>", … })` stable across versions **per documented hash algorithm + schema version**; document migration when algorithm changes. |
| R6 | **Distributed mode** | `createId({ node, region })` embeds or derives worker identity per bit-layout spec; document max nodes; **clock regression and sequence exhaustion are explicit failure modes with operator guidance** (§7.1). |
| R7 | **`parseId()`** | Returns structured object: at least `prefix`, `strategy`, `timestamp` (if applicable), `entropy`/`random` slice or hex, raw bytes if feasible. |
| R8 | **Performance** | On representative hardware: WASM path **at or faster than** `crypto.randomUUID()` for comparable entropy operations; publish benchmark harness vs `uuid` and `nanoid`. |
| R9 | **Runtime support** | Node LTS, modern browsers, Vercel Edge / Cloudflare Workers class runtimes via WASM; document minimum versions. |
| R10 | **Dependencies** | No mandatory heavy deps; optional dev deps for build only. |
| R11 | **Hybrid / legacy recognition** | `parseId()` recognizes **legacy RFC UUID v4/v7** strings (and documented other legacy shapes) and returns `{ strategy, legacy: true, … }` without throwing for valid legacy inputs. |
| R12 | **Migration helpers** | `isLegacyId(id)`; optional `upgradeId` / mapping helpers with **documented lossy vs lossless** semantics. |
| R13 | **Drop-in compat subpaths** | e.g. `better-uuid/compat/uuid`, `better-uuid/compat/nanoid` mimicking common call patterns for alias migration; matrix in `ADOPTION.md`. |
| R14 | **`safe` mode** | `createId({ mode: "safe" })` or global config: **UUID-shaped / standard output**, no prefix—**explicit "nothing surprising changed" path**. |
| R15 | **Company / org defaults** | `createId.configure({ defaultStrategy, prefixes: { … }, … })` for org-wide consistency; document async context semantics. |
| R16 | **Framework context (DX)** | `withIdContext` (or equivalent) + **documented adapter patterns** for Next.js, Express, Hono/Edge so `traceId`/session/prefix are not passed manually every call. |
| R17 | **Killer demo (CLI)** | `npx better-uuid generate` + `parse` yield inspectable JSON in seconds (prefix, time, node/region when applicable)—primary onboarding "aha." |
| R18 | **Bulk generation** | `createId({ count: N })` or equivalent batch API for seeding, load testing, simulations; amortized WASM call overhead; documented per-call vs batch tradeoff. |

### 5.3 ID length guarantees (DB column sizing)

Engineers must know **exact min/max string lengths** per strategy to size `VARCHAR` columns. The wire spec (ARCHITECTURE.md §4.3) will publish this table; normative targets:

| Strategy | Typical length | Max length (with prefix + checksum) | DB guidance |
|----------|---------------|-------------------------------------|-------------|
| `uuidv4` (safe mode) | 36 | 36 | `CHAR(36)` or `UUID` type |
| `time` (UUID v7–class) | 36 | 36 | `CHAR(36)` or `UUID` type |
| `time` + prefix (`usr_`) | ~42 | ~54 | `VARCHAR(64)` recommended |
| `ulid` | 26 | 26 | `CHAR(26)` |
| `nanoid` (default 21) | 21 | configurable | `VARCHAR(N)` per chosen length |
| `snowflake` | ~28–34 | ~46 | `VARCHAR(48)` recommended |
| `deterministic` | same as base strategy | same | depends on underlying strategy |

**Guarantee:** Length is **stable within a schema version**; changing it requires a `schemaVersion` bump and is a **breaking change** (major semver).

### 5.4 v1.x — strong follow-ups

| ID | Feature | Notes |
|----|---------|------|
| A0 | **`npx better-uuid migrate`** | Scans repo for `uuid` / `nanoid` / `randomUUID` usage; suggests or `--write` applies fixes; exit codes for CI. |
| A1 | **`compressId` / `expandId`** | Reversible shortening; document alphabet (Crockford / base58 style); collision probability bounds. |
| A2 | **URL-safe / human-safe alphabet** | Disambiguate `O`/`0`, `l`/`I` in **display** and short forms; canonical form may differ—document mapping. |
| A3 | **`createId({ trace: true })`** | Binds optional OpenTelemetry-style context **or** accepts injected `traceId`/`spanId`; no broken builds if OTEL absent. |
| A4 | **`defineId("user", schema)`** | Named factory + TypeScript types; **runtime validation default-on** in dev or via flag. |
| A5 | **`import "better-uuid/patch"`** | Optional `crypto.randomUUID` patch for backend-only; **big red security/process banner** in docs (supply chain, SSRF, audits). |

### 5.5 Stretch (post validation)

- DB adapters (Postgres types, Mongo conventions).
- Prisma extension / generator.
- Hosted "edge ID" microservice (optional).
- Browser DevTools extension to paste-parse IDs.
- **Native (N-API)** fast path for Node—optional, not default install.
- **ID validation middleware** for API gateways (embedded or standalone endpoint pattern).

### 5.6 Explicit exclusions (v1)

- Distributed **consensus** or **global coordinator** service (IDs must be creatable offline per strategy rules).
- Blockchain / globally unique human-meaningful strings without entropy tradeoffs (out of scope).
- In-place DB primary key rewrites (see `ADOPTION.md` §9 for safe cutover pattern).

### 5.7 Anti-footgun constraints (discipline by default)

**Inspectable by default** implies **guardrails**, not a free-for-all.

- **Prefix length cap** (hard default, e.g. ≤8–12 chars—finalize in wire spec); reject `user-account-production-final-v2` at API boundary with clear error.
- **Reserved prefixes** (`btr`, `sys`, empty, `_`, unicode, …)—list ships in code + docs.
- **Charset** for prefix: restrict to `[a-z0-9]` or documented strict set unless `unsafePrefix: true` for migration-only use.
- **Schema validation:** `defineId` / `configure` paths treat unknown prefix+strategy combos as errors in **strict** company mode.
- **Node ID allocation** (snowflake): no built-in central allocator; teams must document a convention (env var, infra config, deploy-time injection). Collision risk from duplicate `(node, region)` is **operator responsibility**, documented with runbook.

### 5.8 Bundle size budget (frontend credibility)

- **`better-uuid` / `better-uuid/core`:** minimal surface (generate + parse + 1–2 strategies)—**target** printed in README once measured (mental model: **small enough for browser**).
- **`better-uuid` (full):** WASM + all strategies + compression + trace—**document gzipped sizes** per export map; CI budget with tolerance.
- Tree-shaking must be **verified** with a rollup fixture test, not claimed.

*Companion:* `ADOPTION.md`, `ARCHITECTURE.md` (bundle exports).

---

## 6. User flows

### 6.1 Flow: Hybrid coexistence (the real production path)

1. Install `better-uuid`; start with **Layer 1** compat or `mode: "safe"` so **no brownfield breakage**.  
2. New writes use `createId({ strategy: "time", prefix: "usr" })` (or org policy via `configure`).  
3. Old rows **keep** existing UUID v4 strings; `parseId` returns `{ legacy: true, strategy: "uuidv4", … }` for them.  
4. Optionally **dual-write** (`legacyId` + `newId`) during cutover—see `ADOPTION.md`.  
**Success:** No big-bang ID rewrite; logs and parsers accept both worlds.

### 6.1b Flow: Progressive upgrade to time-sortable PKs

1. After 6.1 stable, add column / table for time-ordered IDs per **DB migration playbook** (`ADOPTION.md` + `ROADMAP` Phase 7).  
2. Backfill or write-only new column; switch read path; repoint PK when ready.  
**Success:** Measured insert/index behavior improves without outage.

### 6.2 Flow: Add semantic prefixes for logs

1. Define prefixes per domain entity (`usr`, `ord`, `txn`).  
2. Use `createId({ prefix: "usr", strategy: "time" })`.  
3. Log aggregation filters on `usr_` token.  
**Success:** Support can identify entity class without a DB lookup.

### 6.3 Flow: Deterministic cache key

1. `createId({ input: canonicalEmail, prefix: "ukey", deterministic: true })` (exact API TBD in ARCHITECTURE).  
2. Use as cache key for idempotent provisioning.  
**Success:** Same input → same ID across process restarts (same schema version).

### 6.4 Flow: Multi-region worker

1. Configure `node` id (0–1023) and `region` slug at deploy.  
2. Generate IDs with distributed strategy.  
3. On incident, parse ID to recover approximate time + origin region/node (not PII).  
**Success:** Ops can narrow blast radius from one identifier.

### 6.5 Flow: Parse in debugging

1. Copy ID from log.  
2. `parseId(id)` in REPL or CLI `npx better-uuid parse <id>`.  
3. Read timestamp + strategy + entropy presence.  
**Success:** Faster RCA without decoding proprietary formats per service.

### 6.6 Flow: Schema enforcement (v1.x)

1. `const createUserId = defineId("user", { prefix: "usr", strategy: "time" })`.  
2. Only `createUserId()` is allowed in user module; code review gates misuse.  
**Success:** Enforces one pattern org-wide.

### 6.7 Flow: Drop-in via bundler alias (no PR drama)

1. Add `resolve.alias`: `uuid` → `better-uuid/compat/uuid`, `nanoid` → `better-uuid/compat/nanoid` (exact paths per packager—`ADOPTION.md`).  
2. Run tests; enable `safe` mode org-wide if output must stay RFC-shaped.  
**Success:** Same imports, controlled behavior, optional flip to time strategy later.

### 6.8 Flow: Company mode

1. At app bootstrap: `createId.configure({ defaultStrategy: "time", prefixes: { user: "usr", order: "ord" }, strict: true })`.  
2. Middleware sets `withIdContext({ requestId, … })` once per request.  
3. Handlers call `createId()` or scoped factories—**no** per-call prefix chaos.  
**Success:** One standard, discoverable in code review.

### 6.9 Flow: Killer demo (CLI / first 10 seconds)

1. `npx better-uuid generate --prefix usr --strategy time`  
2. `npx better-uuid parse usr_…` → JSON with decoded timestamp and fields.  
**Success:** "IDs can do this" moment without reading theory.

### 6.10 Flow: When things go wrong (snowflake)

1. Generator returns `ClockRegressed` or `SequenceExhausted`.  
2. App uses configured policy: **wait** (spin/jitter), **error** (fail request), or **fallback** (e.g. emit `uuidv4` + log alert—documented tradeoff).  
**Success:** Runbook in docs; no silent corruption.

---

## 7. API sketch (normative for PRD; implementation in TS)

```ts
import { createId, parseId, defineId, withIdContext } from "better-uuid";
// Layer 1 (optional): import { v4 as uuidv4, v7 as uuidv7 } from "better-uuid/compat/uuid";
// import { nanoid } from "better-uuid/compat/nanoid";
// import { id } from "better-uuid/compat"; // smart default: time-ordered, future-proof

createId.configure({
  defaultStrategy: "time",
  prefixes: { user: "usr", order: "ord" },
  strict: true,
});

// Default: documented default strategy + optional default prefix "btr"
const id1 = createId();

// Time-ordered + semantic prefix
const userId = createId({ prefix: "usr", strategy: "time" });

// Paranoid / brownfield: RFC-shaped output only
const safe = createId({ mode: "safe", strategy: "uuidv4" });

// Deterministic (hash-based); exact option names TBD
const key = createId({ prefix: "key", input: "user@email.com" });

// Distributed — failure policy is explicit
const x = createId({
  strategy: "snowflake",
  node: 42,
  region: "in-west",
  onClockRegression: "wait", // "wait" | "error" | "fallback"
  onSequenceExhausted: "error",
});

withIdContext({ requestId: "…", sessionId: "…" }, () => {
  createId(); // may auto-attach trace context when trace mode enabled (v1.x)
});

parseId("550e8400-e29b-41d4-a716-446655440000");
// e.g. { strategy: "uuidv4", legacy: true, … }

parseId(userId);
// { prefix, strategy, timestamp?, node?, region?, entropy?, schemaVersion, ... }

isLegacyId(someId); // boolean
// upgradeId(oldId) — optional, semantics documented (lossy vs deterministic remap)
```

### 7.1 Failure modes and operator actions (normative)

| Condition | Meaning | Recommended handling |
|-----------|---------|----------------------|
| `ClockRegressed` | OS clock moved backward vs last snowflake timestamp | **`wait`:** block until `now >= last_ts` (cap timeout); **`error`:** 503/retry; **`fallback`:** emit alternate strategy + alert. |
| `SequenceExhausted` | More IDs generated in one ms than sequence bits allow | **`error`:** retry next ms; **`wait`:** sub-ms spin; never duplicate node+time+seq. |
| `InvalidPrefix` / reserved | Footgun prevented | Fix config; never catch and ignore. |
| WASM unavailable | Load failed | Use documented JS fallback subset or fail fast with actionable message. |

**Parsing rules:** Must fail closed with typed errors: `InvalidFormat`, `InvalidPrefix`, `UnsupportedStrategyVersion`, `ChecksumMismatch` (if checksum used)—**except** documented legacy shapes handled as `legacy: true` per R11.

---

## 8. Non-functional requirements

### 8.1 Performance

- WASM hot path for encode/decode and hashing.  
- Benchmarks published in CI (thresholds gated loosely at first).  
- Avoid per-ID heap churn in Rust (reuse buffers where WASM ABI allows).

### 8.2 Security & privacy

- Cryptographic strength: strategies that claim randomness must use CSPRNG (OS / `crypto.getRandomValues`).  
- Deterministic mode must **not** leak raw PII in logs if IDs are stored—document that hashes are reversible only by brute force depending on input space.  
- No secret keys shipped in client bundles for distributed mode unless explicitly documented.

### 8.3 Compatibility & versioning

- **Schema version** nibble/byte in payload for forward decode.  
- Semver for npm crate; breaking wire format = major bump.

### 8.4 Observability

- Library emits **no** logs by default.  
- Optional `debug` build or env-gated traces in JS layer only.

### 8.5 Licensing & distribution

- Open source license (TBD by maintainers).  
- Dual package hazard avoided (single export map for ESM/CJS if needed).

---

## 9. Success metrics

| Metric | How measured |
|--------|----------------|
| Time-to-parse | `parseId` < 1 µs typical in WASM for standard length (target, hardware dependent) |
| Adoption friction | Time to first successful **`generate` + `parse` demo**; % users starting at compat Layer 1 vs `createId` only (survey/docs funnel) |
| Migration clarity | Support issues tagged "migration" trend **down** after `ADOPTION.md` + playbook ship |
| Performance narrative | Reproducible benchmark tables in README |
| Issue taxonomy | < X% issues are "doesn't work on runtime Y" after docs pass |
| Bundle trust | Published **core vs full** size table; CI regression guard on `core` |

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| WASM blocked or slow on some Edge | Document pure JS fallback; feature-detect |
| Clock skew breaks time order | Document monotonic clock option; `snowflake` waits or error on regression |
| Format churn breaks stored IDs | Explicit `schemaVersion`; never change decode for old versions |
| Deterministic IDs enable probing | Document threat model; use salted hash option for public-facing IDs |
| "Cool library" with no migration path | `ADOPTION.md`, compat layer, legacy `parseId`, CLI migrate, DB playbook in README funnel |
| Bundle-size rejection in frontend | Ship and gate **`better-uuid/core`** sizes; document import map |

---

## 11. Open questions (resolve before v1 code freeze)

1. Canonical string format: fixed separator `_` vs configurable?  
2. Prefix case sensitivity and unicode policy.  
3. UUID v7 exact RFC compliance vs "UUIDv7-compatible" Ulid bridge.  
4. Whether `snowflake` layout matches Twitter bit widths or a new documented layout.  
5. Compression: alias table vs purely mathematical shortening.

---

## 12. Glossary

- **Strategy:** Algorithm + layout used to create an ID (random v4, time-sortable, snowflake, etc.).  
- **Schema:** Named binding of prefix + strategy + version + optional constraints.  
- **Entropy:** Unpredictable bits that prevent guessing / collisions.

---

*End of PRD.*
