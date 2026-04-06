---
title: better-uuid — Structured, inspectable identifiers
layout: layout.njk
---

<div class="hero">
  <h1>better-uuid</h1>
  <p class="tagline">Structured, inspectable identifiers — not opaque random strings.</p>
  <div class="hero-actions">
    <a href="/guides/getting-started/" class="btn btn-primary">Getting Started</a>
    <a href="/guides/migration/" class="btn btn-secondary">Migration Guide</a>
    <a href="https://github.com/better-uuid/better-uuid" class="btn btn-secondary">GitHub</a>
  </div>
</div>

> *Stop debugging IDs. Start reading them.*

## Why UUIDs suck in production

```
reqId=8f14e45f-ceea-4667-a716-446655440000
```

What does this tell you? **Nothing.** You need a database lookup to know what entity this is, when it was created, or where it came from.

```
reqId=usr_01HZX7K2M3N4P5Q6R7S8T9V0W
```

→ **type:** user  
→ **createdAt:** 2026-04-06T14:32:…  
→ **region:** in-west

No database lookup. No guessing. Just **read the ID**.

## What is better-uuid?

A TypeScript-first, Rust-powered ID SDK compiled to WebAssembly that treats identifiers as **structured, inspectable values**. It replaces `uuid`, `nanoid`, and `crypto.randomUUID()` with zero-friction drop-in compatibility.

<div class="feature-grid">
  <div class="feature-card">
    <h3>🔍 Inspectable</h3>
    <p>Every ID is parseable: prefix, strategy, timestamp, entropy — all in the string.</p>
  </div>
  <div class="feature-card">
    <h3>📅 Time-ordered</h3>
    <p>UUID v7 strategy for lexicographic sort ≈ creation time. Good for DB indexes.</p>
  </div>
  <div class="feature-card">
    <h3>🔌 Drop-in compat</h3>
    <p>Replace <code>uuid</code> or <code>nanoid</code> imports. Same API, better output.</p>
  </div>
  <div class="feature-card">
    <h3>🧩 Prefixes</h3>
    <p><code>usr_</code>, <code>ord_</code>, <code>txn_</code> — entity type visible in logs without a DB query.</p>
  </div>
  <div class="feature-card">
    <h3>🛡️ CSPRNG only</h3>
    <p>Never <code>Math.random()</code>. OS entropy via <code>getrandom</code> / <code>crypto.getRandomValues</code>.</p>
  </div>
  <div class="feature-card">
    <h3>📦 Tree-shakeable</h3>
    <p>Import only what you need. Core bundle is small enough for the browser.</p>
  </div>
</div>

## Compared to alternatives

| | What it does | What it doesn't |
|---|---|---|
| **`uuid` / `crypto.randomUUID()`** | Random UUIDs | No ordering, no semantics, no parse |
| **UUID v7 (RFC)** | Time-ordered | No prefix, no semantics, no parse |
| **nanoid** | Short, random | Not sortable, not parseable |
| **ULID** | Sortable, base32 | No prefix, no ecosystem compat |
| **better-uuid** | Structured, sortable, parseable, drop-in compat | WASM dependency (with JS fallback) |

**The difference:** every other library generates a string. We generate a **documented structure** you can inspect without a decoder ring.

## Quick start

```bash
npm install better-uuid
```

```ts
import { createId, parseId } from "better-uuid";

const userId = createId({ prefix: "usr", strategy: "time" });
// → "usr_01HZX7K2M3N4P5Q6R7S8T9V0W"

parseId(userId);
// → { prefix: "usr", strategy: "time", timestampMs: 1712345678901n, … }
```

## When NOT to use this

- **Need strict RFC-only storage** → use `uuid` v7 directly.
- **Never debug logs or trace** → `crypto.randomUUID()` is fine.
- **Single-process, simple system** → overkill.
- **Need global coordination** → out of scope. We generate IDs offline.

## Project status

<div class="callout info">
  <p>Phase 1 complete — Rust core with UUID v4 + v7 strategies, full roundtrip parse, 39 Rust + 23 TS tests, 10k golden fixtures, collision model documented.</p>
</div>

### Remaining phases

| Phase | Status | What ships |
|-------|--------|-----------|
| 0 — Foundation | ✅ Done | Monorepo, CI, docs scaffolding |
| 1 — Rust core MVP | ✅ Done | `RandomV4`, `TimeOrdered`, fixtures, tests |
| 2 — WASM + TS API | 🚧 Next | WASM bindings, real `createId`/`parseId` |
| 3 — More strategies | Planned | nanoid, ULID, deterministic, snowflake |
| 4 — JS fallback | Planned | Pure JS for locked-down runtimes |
| 5 — CLI + DX | Planned | `npx better-uuid generate/parse/migrate` |
| 6 — Advanced | Planned | Compression, trace, defineId, patch |
| 7 — DB kit | Planned | Postgres/Mongo migration scripts |
