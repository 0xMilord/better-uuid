---
title: Migration Guide — better-uuid
layout: layout.njk
---

# Migration Guide

Replace `uuid`, `nanoid`, or `crypto.randomUUID()` with better-uuid — **without breaking anything**.

## Three-layer adoption model

| Layer | Who | What |
|-------|-----|------|
| **1 — Drop-in** | Everyone on day one | Same API, same output shape |
| **2 — Upgrade** | After trust | `createId({ strategy: "time", prefix: "usr" })` |
| **3 — Power** | Platform/infra | Schemas, trace, snowflake, compression |

**Principle:** Don't ask devs to change behavior today. Hijack existing call sites; upgrade when ready.

## Layer 1: Drop-in replacement

### From `uuid` package

```diff
- import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
+ import { v4 as uuidv4, v7 as uuidv7 } from "better-uuid/compat/uuid";
```

### From `nanoid` package

```diff
- import { nanoid } from "nanoid";
+ import { nanoid } from "better-uuid/compat/nanoid";
```

### From `crypto.randomUUID()`

```diff
- import { randomUUID } from "crypto";
- const id = randomUUID();
+ import { createId } from "better-uuid";
+ const id = createId({ strategy: "uuidv4", mode: "safe" });
```

### Bundler alias (entire codebase at once)

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

One config change. Every import routes through better-uuid. Run tests. If green, you're done with Layer 1.

## Layer 2: Upgrade to time-ordered IDs

After Layer 1 is stable, opt into time-ordered IDs for **new** tables or columns:

```ts
import { createId } from "better-uuid";

// Old rows keep UUID v4
// New rows get time-ordered IDs
const newUserId = createId({ prefix: "usr", strategy: "time" });
```

`parseId()` recognizes both:

```ts
parseId("550e8400-e29b-41d4-a716-446655440000");
// → { strategy: "uuidv4", legacy: true, … }

parseId("usr_01HZX7K2M3N4P5Q6R7S8T9V0W");
// → { prefix: "usr", strategy: "time", legacy: false, timestampMs: … }
```

## Layer 3: Company mode

```ts
import { createId, withIdContext } from "better-uuid";

// Set org-wide defaults once
createId.configure({
  defaultStrategy: "time",
  strict: true,
  prefixes: { user: "usr", order: "ord", transaction: "txn" },
});

// Middleware sets context once per request
withIdContext({ requestId, sessionId }, () => {
  // Handlers call createId() — no per-call prefix spam
});
```

## Database migration

**Fear:** *"Will this break my existing data?"*

**Answer:** Not if you don't in-place rewrite primary keys on day one.

1. Add nullable `id_v2` column with time-ordered IDs
2. Backfill asynchronously
3. Dual-read until confident
4. Switch writes, then reads
5. Optionally swap PK in a maintenance window

See [Collision Model](/guides/collision-model/) for DB column sizing.
