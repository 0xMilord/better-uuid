---
title: configure() — API Reference
layout: layout.njk
---

# configure()

Set company-wide defaults for `createId()`. Call once at app bootstrap.

## Signature

```ts
function configure(config: BetterUuidConfig): void;
```

## Options

```ts
interface BetterUuidConfig {
  /** Default strategy for calls that don't specify one. */
  defaultStrategy?: "uuidv4" | "time" | "ulid" | "nanoid" | "snowflake" | "deterministic";

  /** Named prefix map (e.g. { user: "usr", order: "ord" }). */
  prefixes?: Record<string, string>;

  /** Strict mode: reject unknown prefix+strategy combinations. */
  strict?: boolean;
}
```

## Example

```ts
import { createId } from "better-uuid";

createId.configure({
  defaultStrategy: "time",
  prefixes: { user: "usr", order: "ord" },
  strict: true,
});

// Now every createId() uses these defaults
createId();           // → "usr_01HZX…" (uses defaultStrategy + first prefix)
createId({ prefix: "ord" }); // → "ord_01HZY…"
```

## strict mode

When `strict: true`, unknown prefix+strategy combinations throw an error. Useful for org-wide enforcement via code review.
