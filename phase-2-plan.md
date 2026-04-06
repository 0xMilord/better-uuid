# Phase 2 Plan — WASM + TS `createId` / `parseId` + legacy parse

## What we have (Phase 0 + 1)

| Component | Status | Location |
|-----------|--------|----------|
| Rust core strategies (`RandomV4`, `TimeOrdered`) | ✅ Done | `crates/better_uuid_core/src/strategies/` |
| Wire format (`layout.rs`) — generate/parse roundtrip | ✅ Done | `crates/better_uuid_core/src/layout.rs` |
| Parse (`parse.rs`) — native + legacy UUID detection | ✅ Done | `crates/better_uuid_core/src/parse.rs` |
| Encoding (`encode.rs`) — hex, crockford | ✅ Done | `crates/better_uuid_core/src/encode.rs` |
| Strategy trait + policies | ✅ Done | `crates/better_uuid_core/src/strategy.rs` |
| Golden fixtures (10k vectors) | ✅ Done | `fixtures/vectors.jsonl` |
| WASM crate skeleton | ⚠️ Partial | `crates/better_uuid_wasm/src/lib.rs` (parse_id_json only) |
| TS package skeleton | ⚠️ Placeholder | `packages/better-uuid/src/index.ts` (mock generate) |
| Compat subpaths (uuid, nanoid) | ⚠️ Partial | `packages/better-uuid/src/compat/` |
| CLI skeleton | ⚠️ Stub | `packages/better-uuid-cli/src/index.ts` |

## What Phase 2 builds

### 1. WASM layer (`crates/better_uuid_wasm`)

**Add:**
- `generate_id(options_json) -> Result<String, String>` — full generation via Rust strategies
- `parse_id_json(input) -> Result<String, String>` — already exists, needs fixture contract test
- `is_legacy_id(input) -> bool` — fast path
- `schema_version() -> u8` — already exists

**Design:** DX-first `wasm-bindgen` with JS objects (JSON in/out). No manual buffer management for Phase 2.

### 2. Pure JS engine (fallback) — `src/engine/js-engine.ts`

**Build:** Real UUID v4 + v7 using `crypto.getRandomValues()` — NO Math.random.

- `jsGenerateV4()` → 122 CSPRNG bits → RFC 4122 string
- `jsGenerateV7(nowMs)` → 48-bit timestamp + 12-bit counter + 62 random → RFC 9562 string
- `jsParseId(input)` → ParsedId (same shape as WASM output)
- `jsIsLegacyId(input)` → boolean

**Why:** When WASM fails (CSP block, no runtime support), we degrade to JS with identical API — no silent quality loss.

### 3. WASM loader — `src/engine/wasm-loader.ts`

**Build:** Dynamic WASM init with auto-fallback.

```ts
const engine = await initEngine(); // tries WASM → falls back to JS
engine.generate({ strategy: "time", prefix: "usr" }); // works either way
engine.parse("550e8400-..."); // works either way
```

**Flow:**
1. Try `WebAssembly.instantiate` with embedded WASM binary
2. If fails → log warning → use JS engine
3. Both engines implement same `Engine` interface

### 4. Wire TypeScript API — `src/index.ts`

**Replace placeholders with real engine calls:**

- `createId(options)` → calls `engine.generate()` with strategy map
- `parseId(id)` → calls `engine.parse()`
- `isLegacyId(id)` → calls `engine.isLegacyId()`
- `configure(config)` → stores config, merges into generate calls
- `withIdContext(ctx, fn)` → pass-through (Phase 5 for real ALS)

### 5. Typed error classes — `src/errors.ts`

**Build:**

```ts
class BetterUuidError extends Error { code: string; }
class GenerateError extends BetterUuidError { strategy: string; details: Record<string, unknown>; }
class ParseError extends BetterUuidError { position: number; snippet: string; }
```

### 6. Wire compat subpaths

- `compat/uuid.ts` → `createId({ strategy: "uuidv4", mode: "safe" })`
- `compat/nanoid.ts` → already real (uses `crypto.getRandomValues`)
- `patch.ts` → already wired

### 7. Wire CLI

- `generate` → calls real `createId()`, outputs parsed JSON
- `parse` → calls real `parseId()`, outputs structured JSON

### 8. Benchmark script

- `scripts/ci-bench.mjs` — 1M iterations: WASM vs `crypto.randomUUID()` vs uuid package
- Publish methodology in README

### 9. Tests

| Test type | What | Count target |
|-----------|------|-------------|
| Unit (TS) | createId, parseId, isLegacyId, configure, errors, JS engine | 40+ |
| Unit (Rust) | WASM generate/parse exports | 10+ |
| Integration | Fixtures contract test: TS output matches Rust vectors | 10k vectors |
| E2E | Generate → parse roundtrip for every strategy | 4+ |
| Edge cases | Invalid input, WASM failure fallback, clock regression | 10+ |

## Execution order

1. Install wasm-pack
2. Complete WASM layer (Rust)
3. Build pure JS engine
4. Build WASM loader with fallback
5. Wire TS index.ts to engine
6. Build typed errors
7. Wire compat subpaths
8. Wire CLI
9. Write tests
10. Benchmark script
11. CI green

## Exit criteria (from ROADMAP)

- ✅ `createId()` works via WASM (or JS fallback)
- ✅ `parseId()` recognizes legacy UUID v4/v7 → `{ legacy: true }`
- ✅ `isLegacyId()` works
- ✅ Typed errors thrown correctly
- ✅ WASM failure → clear error → JS fallback active
- ✅ Compat subpaths functional
- ✅ CLI `generate`/`parse` outputs real JSON
- ✅ Benchmark methodology in README
- ✅ All tests passing
