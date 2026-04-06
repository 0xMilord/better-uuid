# better-uuid — Roadmap

**Version:** 0.2 (planning)  
**Companion:** `PRD.md`, `ARCHITECTURE.md`, **`ADOPTION.md`** (migration + drop-in—**not** an afterthought).

This roadmap is **sequenced for shipping value early** while keeping the Rust/WASM/TS split honest. **Adoption clarity** (hybrid IDs, legacy parse, compat entrypoints) tracks alongside correctness—see PRD R11–R17.

---

## Phase 0 — Foundation (repo & contracts)

**Goal:** Empty repo → reproducible build, no features.

**Deliverables**

- Monorepo skeleton: Rust workspace + npm workspace (per `ARCHITECTURE.md`).  
- CI: Rust fmt/clippy/test; TS typecheck stub.  
- `docs/formats/` placeholder for wire-format specs.  
- **Author `ADOPTION.md` v0** with: Layer 1–3 model, alias recipe stubs, "will this break my DB?" fear answer.  
- CONTRIBUTING + LICENSE (when maintainers decide).  
- Issue templates: bug (runtime + version), feature (strategy vs API).

**Exit criteria**

- One-command local build documented in README (minimal).  
- Green CI on default branch.  
- **`ADOPTION.md` linked from README** as the migration front door.

---

## Phase 1 — Rust core MVP ✅ COMPLETE

**Goal:** Correctness and roundtrip parse for **one** default composite strategy + **uuidv4-compatible** path.

**Deliverables** ✅

- `better_uuid_core`:
  - `RandomV4` — RFC 4122 UUID v4 with 122 CSPRNG bits.
  - `TimeOrdered` — UUID v7 (RFC 9562) with 48-bit timestamp + 12-bit monotonic counter + 62-bit random.
- Golden fixtures: 10,000 vectors JSON (`fixtures/vectors.jsonl`) + 4 legacy vectors (`fixtures/legacy.jsonl`).
- `ParsedId` struct stable with prefix, strategy, timestamp, bytes, legacy flag.
- Collision model documented: `docs/collision-model.md`.
- Property tests: 39 passing (Rust), 23 passing (TypeScript).

**Exit criteria** ✅

- ✅ Property tests: parse ⊕ encode roundtrip for both strategies.
- ✅ Documented collision model and timestamp bits.
- ✅ Lexicographic sortability verified for UUID v7.
- ✅ Clock regression detection and fallback (to UUID v4) implemented.
- ✅ Sequence exhaustion detection implemented.
- ✅ Green CI: `cargo fmt`, `cargo clippy -D warnings`, `cargo test`, `pnpm typecheck`.

---

## Phase 2 — WASM + TS `createId` / `parseId` + **legacy parse**

**Goal:** npm install → `createId()` works in Node with WASM; **`parseId` understands brownfield UUIDs**.

**Deliverables**

- `better_uuid_wasm` wasm-bindgen exports.  
- `packages/better-uuid`: loaders for Node + ESM.  
- Public API: `createId`, `parseId`, `isLegacyId`, typed errors.  
- **`parseId` RFC UUID v4/v7 path** with `{ legacy: true }` (PRD R11).  
- Stub **`better-uuid/compat/*` subpaths** (re-export minimal funcs even if they delegate to `createId` internally).  
- Benchmark script vs `crypto.randomUUID` + `uuid` package (honest setup).

**Exit criteria**

- README table with benchmark methodology (hardware note, Node version).  
- **10-second demo:** `generate` + `parse` documented at top of README linking `ADOPTION.md`.  
- No native addon required.  
- WASM failure triggers **clear** error with link to fallback doc (fallback impl may be stub in this phase if acceptable—prefer minimal JS fallback).

---

## Phase 3 — Strategies & options (PRD R2–R6)

**Goal:** Fulfill MVP strategy matrix from PRD.

**Deliverables**

- Strategies: `nanoid`-class short IDs, `ulid`-style (if not already default time), **custom schema** hook (documented encode/decode contract).  
- `prefix` validation and separator rules.  
- Deterministic IDs: hash-based, schema versioned.  
- Distributed / snowflake-class with `node` + `region` parameters.

**Exit criteria**

- All PRD §5.2 rows R1–R8 (MVP; see PRD for R1–R18 numbering) marked done in issue tracker. Specifically: R1 (createId defaults), R2 (strategies: uuidv4, time, ulid, nanoid, custom), R3 (time-ordered), R4 (prefix), R5 (deterministic), R6 (distributed), R7 (parseId), R8 (perf benchmark).
- Cross-runtime smoke tests pass (Node + one Edge-like runner if available).

---

## Phase 4 — Pure JS fallback

**Goal:** Boring enterprise / locked-down runtimes still work for **subset** of strategies.

**Deliverables**

- Feature matrix: which strategies need WASM vs JS.  
- Runtime detection + documented bundle size impact.

**Exit criteria**

- Documented "minimum capabilities" without WASM.  
- No silent quality degradation (entropy source checks).

---

## Phase 5 — CLI, **migrate**, and DX polish

**Goal:** Adoption via terminal, codemods, and the **"oh damn"** parse output.

**Deliverables**

- `npx better-uuid generate`, `parse` — JSON fields sufficient for ops "aha" (prefix, `createdAt` ISO, node/region when present).
- **`npx better-uuid migrate`** — scan + suggest; optional `--write` (PRD A0).
- `generate --count N` — bulk generation demo (PRD R18).
- `withIdContext` reference adapters for Next.js middleware + Express (PRD R16; see `ARCHITECTURE.md` §6.5).
- Optional `bench`; ESLint rule stretch.
- Export-size report in CI for **`better-uuid/core`** vs full (PRD §5.8).

**Exit criteria**

- CLI uses same vectors as library; JSON output stable with semver.  
- **`migrate` exit code 0/1** usable in CI (e.g. "found deprecated patterns").  
- One recorded **asciicast or GIF path** (optional) showing generate→parse—growth asset.

---

## Phase 6 — Advanced features (PRD §5.4 A1–A5)

**Sequencing:** Tackle in order of dependency and bundle impact.

| Milestone | Feature | PRD ref | Notes |
|-----------|---------|---------|-------|
| 6.1 | `compressId` / `expandId` | A1 | Reversibility tests; alphabet spec frozen |
| 6.2 | URL-safe / human-safe display alphabet | A2 | Disambiguate `O`/`0`, `l`/`I`; canonical may differ |
| 6.3 | Human-safe display alphabet (Crockford) | — | Separate from canonical if needed |
| 6.4 | `trace: true` / optional OTEL peer | A3 | No hard OTEL dependency |
| 6.5 | `defineId` schema factory | A4 | TS inference + runtime validate |
| 6.6 | `better-uuid/patch` (monkey-patch) | A5 | Red-banner doc; env-gated |

**Exit criteria**

- Each feature has docs + fixtures + "non-goals" note (e.g. compression ≠ encryption).
- PRD A1–A5 all marked done.

---

## Phase 7 — Ecosystem + **DB migration kit** (fear removal)

**Goal:** Meet teams where they store data—**this phase is adoption-critical**, not a footnote.

**Deliverables (each optional package)**

- **`ADOPTION.md` § Database playbook** (promoted from appendix to required reading): add column → backfill → dual-read → switch PK → cleanup; rollback notes.  
- Postgres: example migrations (generated column / sidecar ID), index recommendations (B-tree vs BRIN as applicable).  
- MongoDB: shard key + index notes for time-leading strings.  
- Prisma: extension or generator snippet.  
- "Registry" of schema snippets (ShadCN-style copy-paste)—repo folder is fine in v1.

**Exit criteria**

- At least **one** end-to-end **SQL migration script** + narrative for UUID v4 PK → time-ordered IDs **without** claiming zero downtime unless qualified.  
- Explicit **dual-write** pattern documented (PRD / ADOPTION).

---

## Phase 8 — Native fast path (optional, post-adoption)

**Goal:** Speed for Node-heavy generators without WASM overhead (if measured need).

**Deliverables**

- `napi-rs` addon behind `--optional` / feature flag.  
- Same golden vectors as WASM.

**Exit criteria**

- Default install unchanged; native is opt-in.  
- CI builds for major platforms **or** prebuilds.

---

## Phase 9 — Stretch vision

- Hosted edge ID worker (stateless crypto signing—not a snowflake allocator unless specified).  
- Browser DevTools extension: paste ID → structured breakdown.  
- Formal security audit if usage warrants.

---

## Near-term priority stack (TL;DR)

1. **Phase 2: WASM bindings + real TS `createId`/`parseId`** (trust)
2. **CLI `generate`/`parse` with real output** (growth)
3. **Compat subpaths + `configure` / `safe` mode** (Layer 1 onboarding)
4. **Strategies: nanoid, ULID, deterministic, snowflake** (PRD R2–R6)
5. **Failure policies** (snowflake clock/seq)
6. **Migration CLI** (growth)
7. **Compression + schema + trace** (differentiation; PRD A1–A5)
8. **DB kit + Prisma** (lock-in)

### What's left to implement

| Requirement | Status | Phase |
|-------------|--------|-------|
| R1 `createId()` wired to real engine | 🚧 Placeholder in TS | Phase 2 |
| R7 `parseId()` wired to real engine | 🚧 Placeholder in TS | Phase 2 |
| R11 Legacy UUID recognition | ✅ Rust done, TS needs wiring | Phase 2 |
| R12 `isLegacyId()` | ✅ Implemented (placeholder detection) | Phase 2 |
| R13 Compat subpaths | ✅ API surface defined | Phase 2 |
| R14 `safe` mode | 🚧 TS validation needed | Phase 2 |
| R15 `configure()` | ✅ Implemented | Phase 2 |
| R16 `withIdContext()` | 🚧 Pass-through until Phase 2 | Phase 5 |
| R17 CLI killer demo | 🚧 Skeleton exists | Phase 5 |
| R18 Bulk generation | 🚧 API defined | Phase 5 |
| R2 nanoid/ULID/deterministic/snowflake | 🚧 Not implemented | Phase 3 |
| R3 Time-ordered (lex sort) | ✅ Rust core done | Phase 1 |
| R4 Prefix system | ✅ Implemented | Phase 0 |
| R5 Deterministic IDs | 🚧 Not implemented | Phase 3 |
| R6 Distributed/snowflake | 🚧 Not implemented | Phase 3 |
| A0 Migration CLI | 🚧 Stub exists | Phase 5 |
| A1 compressId/expandId | 🚧 Not implemented | Phase 6 |
| A2 Safe alphabet | 🚧 Not implemented | Phase 6 |
| A3 Trace/OTEL | 🚧 Not implemented | Phase 6 |
| A4 defineId schema | 🚧 Not implemented | Phase 6 |
| A5 Monkey patch | ✅ API defined | Phase 6 |

---

## How we decide "done" for v1.0.0

- All **PRD §5.2** acceptance rows satisfied (R1–R18, including R11–R17: legacy parse, compat, safe mode, context, CLI).
- README: **emotional + rational** hooks (PRD §4.1), **UUID v7 comparison** table, quickstart, benchmarks, **prominent link to `ADOPTION.md`**.
- Strategy name mapping table in `ARCHITECTURE.md` §3.1 matches PRD §5.1 and all implementations.
- ID length table (PRD §5.3) published in docs.
- Stability: wire-format version byte frozen; breaking change ⇒ major semver.
- No known **P0** correctness bugs in parse/generate.

---

## Maintenance releases (ongoing)

- Runtime support drift (new Node LTS, worker changes).  
- Dependency updates with audit trail.  
- Performance regression monitoring (weekly bench optional).

---

*End of ROADMAP.*
