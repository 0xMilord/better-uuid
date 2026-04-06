# better-uuid — Technical Architecture

**Version:** 0.2 (planning)  
**Audience:** Implementers, reviewers, contributors.  
**Companion:** `PRD.md` (requirements), `ROADMAP.md` (phases), `ADOPTION.md` (migration + compat).

---

## 1. Goals & constraints

### 1.1 Architectural goals

1. **Single encoding core:** One Rust implementation of bit layouts, hashing, and validation.  
2. **WASM-first distribution:** Same logic in Node, browser, and Edge without native binaries.  
3. **TypeScript as the product API:** Ergonomics, schemas, runtime detection, optional OTEL hooks.  
4. **Graceful degradation:** Optional pure-JavaScript fallback for environments where WASM is unavailable or policy-blocked (subset of strategies acceptable).  
5. **Deterministic builds:** Reproducible `wasm` artifacts in CI; lockfile discipline.

### 1.2 Non-goals (initial release)

- Default install path that requires **node-gyp** or platform-specific shared libraries.  
- Guaranteeing **RFC 4122** canonical string for every strategy (only strategies named `uuidv7` etc. owe RFC alignment).

---

## 2. System context

```mermaid
flowchart LR
  subgraph app [Application code]
    TS[TypeScript SDK]
  end
  subgraph pkg [better-uuid package]
    WASM[wasm-pack output]
    JSFallback[Optional JS fallback]
  end
  core [Rust core crate]
  TS --> WASM
  TS -.-> JSFallback
  WASM --> core
  JSFallback -.-> TS
```

**External dependencies (conceptual):**

- **Entropy:** OS CSPRNG via `getrandom` (Rust) / `crypto.getRandomValues` (JS fallback path).  
- **Clock:** System time for time-ordered and snowflake-class strategies; document monotonicity guarantees.

---

## 3. Repository layout (target)

```text
better-uuid/
├── crates/
│   ├── better_uuid_core/     # Pure Rust: layouts, parse, validate, hash
│   └── better_uuid_wasm/     # wasm-bindgen thin layer; minimal API surface
├── packages/
│   ├── better-uuid/          # Published npm: TS entry, wasm loader, types, compat subpaths
│   │   └── src/
│   │       ├── index.ts      # createId, parseId, configure, withIdContext
│   │       └── compat/
│   │           ├── uuid.ts   # v4/v7-shaped API for alias migration
│   │           ├── nanoid.ts
│   │           ├── id.ts     # opinionated default (e.g. time-ordered)
│   │           └── patch.ts  # optional crypto.randomUUID patch (document risks)
│   ├── better-uuid-cli/      # npx better-uuid generate | parse | migrate | bench
│   └── better-uuid-bench/    # Benchmark harness (optional package or scripts/)
├── PRD.md
├── ARCHITECTURE.md
├── ROADMAP.md
├── ADOPTION.md               # Zero-effort upgrade, DB playbook, aliases
└── scripts/
    ├── build-wasm.sh / .ps1
    └── ci-bench.mjs
```

**Rationale:** `crates/*` keeps Rust workspace clean; `packages/*` follows JS monorepo norms (pnpm or npm workspaces).

---

## 3.1 Strategy name mapping (canonical cross-reference)

This table ties PRD §5.1 (strategy names), user-facing API strings, and Rust trait names together. **Any discrepancy is a bug.**

| PRD §5.0 row | User `strategy` string | Rust trait (§4.1) | Compat subpath |
|--------------|-----------------------|--------------------|----------------|
| `uuidv4` | `"uuidv4"` | `RandomV4` | `better-uuid/compat/uuid` (v4 export) |
| `time` | `"time"` | `TimeOrdered` | — (primary API) |
| `ulid`-style | `"ulid"` | `UlidLike` | — |
| `nanoid`-style | `"nanoid"` | `NanoLike` | `better-uuid/compat/nanoid` |
| `snowflake` | `"snowflake"` | `Snowflake` | `better-uuid/snowflake` |
| `deterministic` | `"deterministic"` | `Deterministic` | — |
| *(custom)* | user-defined | `IdStrategy` impl | — |

**`mode: "safe"`** (PRD R14): Not a strategy itself. It is a **validation wrapper** that enforces UUID-shaped output (36-char, `8-4-4-4-12` hex) regardless of underlying strategy. Implementation: TS layer validates output format; Rust core has a `SafeMode` strategy that delegates to `RandomV4` or `TimeOrdered` (RFC UUID v7 form) and rejects prefix.

---

## 4. Rust core (`better_uuid_core`)

### 4.1 Responsibilities

| Module (logical) | Responsibility |
|------------------|----------------|
| `strategies` | Trait-based ID generation: `RandomV4`, `TimeOrdered`, `UlidLike`, `NanoLike`, `Snowflake`, `Deterministic` |
| `layout` | Bit-level packing: widths for timestamp, node id, sequence, version, checksum |
| `encode` | Fixed alphabet codecs (base32 crockford, base58, hex, custom tables) |
| `hash` | Stable hashing for deterministic IDs (e.g. BLAKE3 or SHA-256—finalize in design review) |
| `parse` | Zero-copy parse where possible; structured `ParsedId` |
| `validate` | Prefix rules, length, checksum, schema version range |

### 4.2 Strategy trait (conceptual)

```rust
pub trait IdStrategy {
    const STRATEGY_ID: u8; // wire enum
    fn generate(&self, ctx: &mut GenContext) -> Result<IdPayload, GenerateError>;
}

pub struct GenContext<'a> {
    pub prefix: Option<&'a str>,
    pub now_ms: u64,
    pub random: &'a mut dyn RandomSource,
    pub node: Option<NodeDescriptor>,
    pub deterministic_input: Option<&'a [u8]>,
    /// Snowflake / distributed: behavior when wall clock regresses vs last issued time.
    pub on_clock_regression: ClockRegressionPolicy,
    pub on_sequence_exhausted: SequenceExhaustedPolicy,
}

// Policies map to PRD §7.1; TS passes enum → WASM as u8.
```

**Parsing** mirrors generation: `fn parse(s: &str) -> Result<ParsedId, ParseError>` dispatches on prefix + version nibble + strategy marker. **Legacy branch:** RFC UUID string detection returns `ParsedId { legacy: true, … }` without treating it as an error path.

### 4.3 Wire format (high-level)

**Recommended pattern (exact spec TBD in core docs):**

```text
<optional_prefix>_<payload_b32_or_b58>_<optional_checksum>
```

- **Version byte / nibble** inside payload first (after decode), not in the raw prefix, unless prefix is registered in a schema table.  
- **UTF-8 only** for prefix in v1; reject other encodings explicitly.

**Example logical layout for a composite time+entropy strategy:**

| Field | Bits | Notes |
|-------|------|-------|
| `schema_version` | 8 | Breaking decode changes bump this |
| `strategy` | 8 | Enum |
| `timestamp_ms` | 48–64 | Truncation policy explicit |
| `entropy` | 64–128 | Target collision resistance |
| `node_id` | optional 10–16 | Snowflake segment |
| `sequence` | optional 12–16 | Per-ms counter |

**Endianness:** Big-endian on wire for human-stable hex dumps (document).

### 4.4 Legacy UUID parse path

- Detect standard `8-4-4-4-12` hex form (UUID v4, v7, others as scoped).  
- Normalize casing; validate version/variant per RFC where applicable.  
- Populate `legacy: true` in `ParsedId` so apps treat brownfield IDs as first-class in logs and migrations.

### 4.5 Deterministic mode

- Input canonicalization in TS **before** bytes hit Rust (e.g. NFC unicode, lowercasing email policy documented).  
- Optional **application salt** (env or constructor option) mixed into hash to prevent rainbow tables on emails.  
- Output includes visible `schema_version` so future algorithm changes do not silently alter IDs under same inputs.

### 4.6 Snowflake / distributed mode

- Document: timestamp bits, region hash bits, node id bits, sequence.  
- **Clock regression:** honor `ClockRegressionPolicy` from `GenContext`—wait with cap, fail fast, or delegate to TS **fallback** callback if we expose a hook (TS-only escape hatch for `fallback` strategy injection).  
- **Sequence overflow:** `SequenceExhaustedPolicy` mirrors PRD §7.1; never reuse `(time, node, seq)`.

### 4.7 Safety & `unsafe`

- Prefer no `unsafe`; if required for SIMD, isolate behind feature flags with tests.

---

## 5. WASM boundary (`better_uuid_wasm`)

### 5.1 Exposed functions (minimal)

Expose **coarse** operations to minimize ABI overhead:

- `generate_id_packed(options_ptr, options_len, out_ptr, out_cap) -> isize`  
  - Returns byte length written or negative error code.  
- `parse_id_utf8(ptr, len) -> JsValue` via `wasm-bindgen` returning serialized struct OR write into preallocated buffer.

**Alternative (DX-first):** `wasm-bindgen` functions that take JS objects—acceptable if benchmarks stay within goal; start typed, optimize hot paths.

### 5.2 Allocation model

- Prefer caller-provided buffers for hot loops (`createId` in tight server handler).  
- JS wrapper can pool `ArrayBuffer` if measurements show benefit.

### 5.3 Loading strategy (npm package)

1. **Node:** `import wasm from './pkg/better_uuid_wasm_bg.wasm'` with stable ESM/CJS interop (tooling: `wasm-pack` target `web`/`bundler`/`nodejs`—pick one primary).  
2. **Browser / bundlers:** Same asset; fall back to dynamic `fetch` for non-bundled contexts.  
3. **Edge:** Ensure **no `fs`** assumptions; WASM as inlined base64 or fetch from same origin.  
4. **Feature detect:** If `WebAssembly.instantiate` fails, flip to JS fallback.

---

## 6. TypeScript SDK (`packages/better-uuid`)

### 6.1 Public API layers

| Layer | Contents |
|-------|----------|
| **Core** | `createId`, `parseId`, error types |
| **Schema** | `defineId`, Zod-like validators optional |
| **Interop** | Re-export strategy enums, type guards |
| **Advanced** | `compressId`, `expandId`, `withTrace` (feature modules) |

### 6.2 Runtime adapter

```ts
interface RuntimeAdapter {
  nowMs(): bigint | number;
  randomBytes(len: number): Uint8Array;
  loadWasm?(): Promise<WebAssembly.Module>;
}

createId.configure({ runtime: adapter }); // optional; tests use fake clocks
```

### 6.3 Error taxonomy (typed)

- `BetterUuidError` base  
- `ParseError` (`code`, `position`, `snippetSafe`)  
- `GenerateError` (`code`, `strategy`, `details`)  
- **No stack-less throws** for control flow in hot paths.

### 6.4 Tree-shaking and export map ("core" vs "full")

| Export / subpath | Intended use | Contents (conceptual) |
|------------------|--------------|------------------------|
| `better-uuid` | Default app import | `createId`, `parseId`, `configure`, `withIdContext`, WASM loader |
| `better-uuid/core` | Browser-first, tiny surface | Minimal strategies + parse; smallest gzip budget |
| `better-uuid/snowflake` | Opt-in distributed | Snowflake encoder + policies |
| `better-uuid/parse-only` | Log pipelines | Parse + validate, no WASM generate |
| `better-uuid/compat/uuid` | Alias migration | `v4`, `v7`-shaped APIs |
| `better-uuid/compat/nanoid` | Alias migration | length/default alphabet parity target |
| `better-uuid/compat` | Smart default `id()` | Opinionated time-ordered default |
| `better-uuid/patch` | **Optional, dangerous** | Patches global `crypto.randomUUID`—see §9.1 |

- CI runs a **rollup/esbuild fixture** that asserts unreachable strategies do not appear in `core` bundle graph.  
- Avoid side-effectful top-level module body except **`patch.ts`** (explicit side effects).

### 6.5 Framework context binding

- **`withIdContext(ctx, fn)`** uses `AsyncLocalStorage` (Node) or documented equivalent pattern for Edge (pass-through / no-op where ALS missing).  
- **`createId.configure`** stores org defaults in module singleton; merged with per-request context from ALS.  
- **Reference middleware** (examples or small optional packages): Next.js (middleware + route handlers), Express (`req`-scoped helper), Hono (`c.get('idContext')`). Goal: **one** place sets `requestId` / session, not every handler.  
- OTEL integration remains **peer optional** per PRD A3.

### 6.6 TypeScript types

- `CreateIdOptions` discriminated union by `strategy`.  
- `ParsedId` union by `strategy` for type narrowing; `legacy: true` narrows to RFC UUID branch.

---

## 7. CLI (`packages/better-uuid-cli`)

Commands:

- `better-uuid generate [--strategy] [--prefix] [--count]` — **primary demo** (inspectable output).  
- `better-uuid parse <id>` — JSON to stdout for scripts and `jq`.  
- `better-uuid migrate [--write]` — static scan / codemod suggestions for `uuid`, `nanoid`, `randomUUID` (PRD A0).  
- `better-uuid bench [--compare uuid nanoid]` (optional).

Implementation: thin wrapper calling same WASM/JS stack as library; `migrate` may use `fs` + simple AST (TypeScript compiler API or `jscodeshift`)—keep dependency-light.

---

## 8. Encoding & alphabets

### 8.1 Canonical vs display

- **Canonical:** what `createId` emits and `...equals` uses.  
- **Display:** Crockford base32 for humans; mapping table in `docs/formats.md` (future).  
- Compression produces **non-canonical** aliases only if documented as reversible **with schema + optional secret** (if applicable).

### 8.2 Human-safe alphabet

- Use Crockford or similar for subset strategies; document **case insensitivity policy**.
- For base58, specify **no `0`, `O`, `I`, `l`** (depending on alphabet).

### 8.3 Custom alphabet API (stretch)

For teams with brand or compliance constraints (e.g. banned characters for SMS/QR):

```rust
pub struct CustomAlphabet {
    pub chars: Vec<char>,      // validated: no duplicates, min size 32
    pub case_sensitive: bool,  // affects parse
    pub ambiguous_remap: Option<HashMap<char, char>>, // e.g. O→0, l→1
}
```

- TS wrapper: `createId({ alphabet: customTable, strategy: "nanoid" })`.
- **Non-goal:** custom alphabets for `uuidv4` / `time` (RFC-shaped strategies)—those are locked to hex + dashes.
- Custom alphabets produce a **distinct `strategy` marker** in the wire format so `parseId` can decode correctly.

### 8.4 Schema versioning & provenance

Every encoded ID carries a `schema_version` byte (PRD §5.3 ID length guarantees). This enables:

1. **Forward decode:** future library versions can still read old IDs.
2. **Provenance audit:** `parseId` can optionally return `{ producedBy: "better-uuid@1.2.3", schemaVersion: 1 }` if the wire format embeds a producer tag (opt-in, adds ~2 chars).
3. **Breaking change guard:** any change to decode logic for a given `schemaVersion` is a **semver-major** event.

**Wire format evolution:**
```
v1: <prefix>_<strategy_byte>_<schema_byte>_<payload>_<optional_checksum>
v2: (reserved; breaking changes only)
```

---

## 9. Security model

| Topic | Approach |
|-------|----------|
| Random strength | CSPRNG only; reject `Math.random` |
| Timing side channels | Not security-critical for ID generation; document |
| Deterministic IDs | Document bruteforce / enumeration risk on small input spaces |
| Maliciously long prefix | Hard cap (e.g. 16 chars) default |
| **`better-uuid/patch`** | **High risk:** global monkey-patch affects *all* callers in process; forbidden in libraries; audit-only in apps; never default import in shared packages |

### 9.1 Monkey-patch module (`patch.ts`)

- Only exports side effect: replace `crypto.randomUUID` implementation (or Node `crypto.webcrypto`) with engine-backed function.  
- Must log **once** at trace level or require explicit `BETTER_UUID_PATCH=1` env kill-switch.  
- Document: breaks assumptions of transitive deps; snapshot tests required if used.

---

## 10. Observability integration (v1.x)

- `createId({ trace: true })` reads `AsyncLocalStorage` context **or** accepts `{ traceId, spanId }`.  
- Do **not** hard depend on `@opentelemetry/api`; use **optional peer** pattern.  
- Stamp **non-secret** trace correlation only if size budget allows; else attach as separate header (document tradeoff).

---

## 11. Testing strategy

| Layer | Tests |
|-------|--------|
| Rust | Unit tests per strategy; property tests (`proptest`) for roundtrip encode/decode |
| WASM | `wasm-bindgen-test` in headless browser + Node |
| TS | `vitest` / `node:test`; contract tests vs Rust vectors (`fixtures/*.json`) |
| Cross-runtime | Smoke tests: Node, workerd (if available), browser (playwright optional) |

**Fixture format:** JSON lines `{ "options": {...}, "id": "...", "parsed": {...} }` generated by Rust CLI for Golden Master tests.

---

## 12. CI / build pipeline

1. `cargo fmt`, `clippy`, `cargo test`  
2. `wasm-pack build` with locked versions  
3. `pnpm test` / typecheck across packages  
4. Optional: benchmark regression gate (noisy; use tolerance)

**Artifacts:** Publish `wasm` inside npm tarball; attach SBOM optional.

---

## 13. Performance notes

- Avoid UTF-8 validation where WASM receives validated TS strings (still validate once at boundary).  
- Batch APIs considered: `createMany(n)` for games/simulations.  
- SIMD for hashing and base encodings behind `target_feature`.

---

## 14. Future: native acceleration

- **N-API addon** calling same `better_uuid_core` via `cxx`/`napi-rs`.  
- Feature flag `better-uuid/native`; **never** default required dep.

---

## 15. Open technical decisions (log)

| Decision | Options | Status |
|----------|---------|--------|
| Hash for deterministic | BLAKE3 vs SHA-256 | Open |
| WASM ABI | wasm-bindgen vs manual | Open (likely bindgen) |
| ID checksum | CRC vs truncated hash | Open |
| Monorepo tool | pnpm vs npm | Open |

---

*End of ARCHITECTURE.*
