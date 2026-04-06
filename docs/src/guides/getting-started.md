---
title: Getting Started — better-uuid
layout: layout.njk
---

# Getting Started

Install and generate your first ID in under 30 seconds.

## Install

```bash
npm install better-uuid
# or
pnpm add better-uuid
# or
yarn add better-uuid
```

## Generate your first ID

```ts
import { createId, parseId } from "better-uuid";

// Default: time-ordered strategy
const id = createId();
// → "01HZX7K2M3N4P5Q6R7S8T9V0W"

// With semantic prefix
const userId = createId({ prefix: "usr", strategy: "time" });
// → "usr_01HZX7K2M3N4P5Q6R7S8T9V0W"

// Parse any ID
parseId(userId);
// → {
//     prefix: "usr",
//     strategy: "time",
//     timestampMs: 1712345678901n,
//     entropy: "a3f7c1…",
//     legacy: false
//   }
```

## Switch from `uuid` (10 seconds)

```diff
- import { v4 as uuidv4 } from "uuid";
+ import { v4 as uuidv4 } from "better-uuid/compat/uuid";
```

Same function signature. Same output shape. Zero behavior change.

## Switch from `nanoid` (10 seconds)

```diff
- import { nanoid } from "nanoid";
+ import { nanoid } from "better-uuid/compat/nanoid";
```

Same default length (21). Same URL-safe alphabet. Drop-in.

## Recommended default

```ts
import { createId } from "better-uuid";

createId({ strategy: "time", prefix: "entity" });
```

**Time-ordered** (lex-sortable, good for DB indexes). **Prefixed** (entity type visible). **Parseable** (no DB lookup needed).

## Next steps

- [Migration Guide](/guides/migration/) — Replace uuid/nanoid in your codebase
- [API: createId()](/api/createId/) — Full options reference
- [Collision Model](/guides/collision-model/) — Entropy and safety guarantees
