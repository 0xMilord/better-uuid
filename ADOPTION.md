# better-uuid — Adoption, migration, and drop-in upgrades

**Purpose:** Remove **adoption friction**. Most teams will not rewrite IDs in one PR. This doc is the **front door** for: *"Will this break my data?"*, *"How do I switch from uuid/nanoid?"*, and *"What do we standardize on?"*

**Related:** `PRD.md` (requirements), `ARCHITECTURE.md` (compat paths, bundles), `ROADMAP.md` (when each piece ships).

---

## 1. Mental model: three layers (do not skip Layer 1)

| Layer | Who | What |
|-------|-----|------|
| **1 — Drop-in** | Everyone on day one | `uuid`-shaped / `nanoid`-shaped APIs, bundler aliases, optional `mode: "safe"` — **no behavior surprise** if configured that way |
| **2 — Upgrade** | After trust | `createId({ strategy: "time", prefix: "usr" })` — sortable, readable |
| **3 — Power** | Platform / infra | Schemas, trace binding, snowflake, compression |

**Principle:** *Don't ask devs to change behavior today. Hijack existing call sites; upgrade when ready.*

**Sharp positioning:**

- *No refactor. Just replace the import.* (where alias-safe)
- *Switch from uuid/nanoid in under five minutes.* (scope: import/alias + CI green—not always PK migration)

---

## 2. Hybrid mode and brownfield IDs (non-negotiable story)

### 2.1 Coexistence

- **Old rows keep** existing UUID v4 (or whatever you shipped).  
- **New rows** get `createId(...)` strings per policy.  
- **`parseId`** must accept both **native better-uuid payloads** and **legacy RFC UUID strings**, returning `legacy: true` for the latter (see PRD R11).

### 2.2 Example parse outcomes

```ts
parseId("550e8400-e29b-41d4-a716-446655440000");
// → { strategy: "uuidv4", legacy: true, … }

parseId("usr_01HZX…"); // example native form
// → { prefix: "usr", strategy: "time", legacy: false, timestamp: …, … }
```

### 2.3 Helpers

- `isLegacyId(id)` — fast branch for metrics, UI, dual-read code paths.  
- `upgradeId(oldId)` — **optional**; if provided, document whether it is **lossless** (wrapper only), **deterministic remap** (hash), or **disallowed** (teams must use new column).

### 2.4 Dual-write (serious systems)

During cutover, persist both if needed:

```ts
{
  legacyId: uuidv4(),       // or existing column
  newId: createId({ prefix: "usr", strategy: "time" }),
}
```

Read from `newId` when populated; fall back to `legacyId`. Retire when safe.

---

## 3. Drop-in API parity (Layer 1)

**Targets:** Same ergonomics as what teams already import.

```ts
// UUID-class surface (exact exports TBD; names illustrative)
import { v4 as uuidv4, v7 as uuidv7 } from "better-uuid/compat/uuid";

// Nano-class surface
import { nanoid } from "better-uuid/compat/nanoid";

// Opinionated default — time-ordered, documented default prefix behavior
import { id } from "better-uuid/compat";
```

**`mode: "safe"` (global or per-call):** RFC-shaped output, **no** custom prefix—answers *"promise nothing weird changed."*

---

## 4. Bundler alias hijack (enterprise-friendly)

Let teams **swap implementations without touching every file** (verify with your bundler; test before merge).

**Webpack-style:**

```js
// webpack.config.js — illustrative
resolve: {
  alias: {
    uuid: "better-uuid/compat/uuid",
    nanoid: "better-uuid/compat/nanoid",
  },
},
```

**Vite / Next:** use `resolve.alias` in `vite.config` / `next.config` equivalently.

**Reality check:** Subpath exports must match your lockfile and CJS/ESM interop—document known sharp edges per release.

---

## 5. Progressive upgrade path

1. **Week 0:** Alias or compat import; **`safe`** + v4 behavior **unchanged** externally.  
2. **Week n:** Opt into `v7` / `strategy: "time"` for **new** tables or columns.  
3. **Later:** Prefixes + `createId.configure` **company mode** + middleware context.

---

## 6. Company mode (org-wide discipline)

```ts
import { createId, withIdContext } from "better-uuid";

createId.configure({
  defaultStrategy: "time",
  strict: true,
  prefixes: {
    user: "usr",
    order: "ord",
    transaction: "txn",
  },
});

// Middleware sets context once per request
withIdContext({ requestId, sessionId }, () => {
  // handlers call createId() — no manual prefix spam
});
```

**Framework adapters:** reference patterns live in `ARCHITECTURE.md` §6.5 (Next.js, Express, Hono/Edge). Ship examples first if packages are premature.

---

## 6b. Compression (short IDs for QR, SMS, share links)

When you need IDs that humans can **type** or **scan**:

```ts
import { compressId, expandId } from "better-uuid/compress";

const short = compressId("usr_01HZX…"); // → shorter form (Crockford/base58)
const original = expandId(short);       // → back to canonical
```

- **Reversible:** compression is lossless; `expandId(compressId(x)) === x`.
- **Non-canonical:** compressed form is an alias; store canonical in DB.
- **Not encryption:** anyone with the library can expand—do not use for secrets.
- Alphabet options: Crockford base32 (default), base58 (PRD A2). See `ARCHITECTURE.md` §8.

---

## 7. Monkey patch mode (`better-uuid/patch`)

```ts
import "better-uuid/patch";
// crypto.randomUUID() now routes through better-uuid engine
```

**Warning:** This is **effective and dangerous**. It changes behavior for *every* consumer in-process—including dependencies. Use only in **applications** you control, behind env flag, with security review. See `ARCHITECTURE.md` §9.1.

---

## 8. Migration CLI

```bash
npx better-uuid migrate          # scan + print suggestions
npx better-uuid migrate --write  # apply codemods (when implemented)
```

Surfaces: `uuid`, `nanoid`, `crypto.randomUUID`, common import paths. Exit codes suitable for CI (*"found N legacy patterns"*).

---

## 9. Database migration playbook

**Fear:** *"Will this break my existing data?"* **Answer:** Not if you **don't** in-place rewrite primary keys on day one.

### 9.1 ID length planning (column sizing)

Before you add a column, know your target lengths (PRD §5.3; final table in docs):

| Strategy | VARCHAR recommendation | Notes |
|----------|----------------------|-------|
| `uuidv4` / `time` (UUID-shaped) | `CHAR(36)` or native `UUID` | Fixed width |
| `time` + prefix (e.g. `usr_…`) | `VARCHAR(64)` | Covers max prefix + payload + checksum |
| `ulid` | `CHAR(26)` | Fixed width, Crockford base32 |
| `snowflake` | `VARCHAR(48)` | Covers node + region bits |
| `nanoid` (default 21) | `VARCHAR(N)` per chosen length | Configurable |

### 9.2 Recommended pattern (relational)

1. Add nullable **`id_v2`** (or new PK column) with time-ordered better-uuid strings.
2. **Backfill** asynchronously; dual-read until confident.
3. Switch writes to `id_v2`; then reads.
4. **Optionally** swap PK / drop old column in a planned migration (constraints, FK rebuild—your DBA owns this).
5. **Indexes:** document B-tree on time-leading keys; avoid assuming UUID v4 patterns. For time-ordered strings, **BRIN** may be smaller than B-tree on large tables—benchmark.

### 9.3 Concrete SQL (Postgres example)

```sql
-- Step 1: Add sidecar column
ALTER TABLE users ADD COLUMN id_v2 VARCHAR(64);
CREATE INDEX idx_users_id_v2 ON users (id_v2);

-- Step 2: Backfill (run in batches in production)
-- UPDATE users SET id_v2 = <better-uuid time-ordered> WHERE id_v2 IS NULL;

-- Step 3: Dual-read in application code
-- SELECT * FROM users WHERE id_v2 = $1 OR (id_v2 IS NULL AND id = $2);

-- Step 4 (optional): Promote to PK in a maintenance window
-- ALTER TABLE users DROP CONSTRAINT users_pkey;
-- ALTER TABLE users ADD PRIMARY KEY (id_v2);
```

Ship concrete SQL **in repo** per `ROADMAP.md` Phase 7—not only prose. The repo will contain `migrations/` with copy-paste scripts per major RDBMS.

### 9.4 Rollback

If `id_v2` rollout fails:
1. Revert read path to `id` (legacy UUID).
2. Stop writing `id_v2`.
3. Drop column when confident.

**Zero data loss** as long as the legacy PK is untouched during the experiment.

---

## 10. Failure modes (what operators do)

Snowflake-class generation can fail closed: **clock regression**, **sequence exhaustion**. Policies: `wait` | `error` | `fallback` (see PRD §7.1). **Never** silently duplicate IDs.

---

## 11. Size budget (frontend teams)

- Import **`better-uuid/core`** when bundle size is sacred.  
- Full package + WASM + extra strategies = measure and publish gzip numbers (PRD §5.6).

---

## 12. Killer demo (copy-paste)

```bash
npx better-uuid generate --prefix usr --strategy time
npx better-uuid parse usr_…
```

Goal: JSON that makes IDs feel like **data**, not dice rolls.

---

## 13. Emotional hooks (use in README, not investor decks)

- *Stop debugging IDs. Start reading them.*  
- *Your logs shouldn't require a database lookup.*

---

*This file is **product-critical**. Keep it updated when wire formats or compat paths change.*
