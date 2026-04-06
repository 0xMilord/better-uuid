---
title: createId() — API Reference
layout: layout.njk
---

# createId()

Generate a structured, inspectable ID.

## Signature

```ts
function createId(options?: CreateIdOptions): string;
```

## Options

```ts
interface CreateIdOptions {
  /** ID generation strategy. Defaults to configured `defaultStrategy`. */
  strategy?: "uuidv4" | "time" | "ulid" | "nanoid" | "snowflake" | "deterministic";

  /** Semantic prefix (e.g. "usr", "ord"). Validated against [a-z0-9]{1,12}. */
  prefix?: string;

  /** Safe mode: UUID-shaped output, no prefix. "Nothing surprising changed." */
  mode?: "safe";

  /** Deterministic input (for `deterministic` strategy). */
  input?: string;

  /** Snowflake: unique node identifier (0–1023). */
  node?: number;

  /** Snowflake: region slug (e.g. "in-west"). */
  region?: string;

  /** Snowflake: behavior on clock regression. */
  onClockRegression?: "wait" | "error" | "fallback";

  /** Snowflake: behavior on sequence overflow. */
  onSequenceExhausted?: "wait" | "error";

  /** Generate N IDs in one call (batch API). */
  count?: number;
}
```

## Examples

### Default (time-ordered)

```ts
import { createId } from "better-uuid";

createId();
// → "01HZX7K2M3N4P5Q6R7S8T9V0W"
```

### With prefix

```ts
createId({ prefix: "usr", strategy: "time" });
// → "usr_01HZX7K2M3N4P5Q6R7S8T9V0W"
```

### Safe mode (RFC-shaped)

```ts
createId({ mode: "safe" });
// → "550e8400-e29b-41d4-a716-446655440000"
```

### UUID v4 (random)

```ts
createId({ strategy: "uuidv4" });
// → "f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

## Errors

Throws `GenerateError` when:

| Error | When |
|-------|------|
| `ClockRegressed` | OS clock moved backward (snowflake, policy = `error`) |
| `SequenceExhausted` | Too many IDs in one ms (snowflake) |
| `InvalidPrefix` | Prefix fails validation |
| `EntropyFailure` | OS CSPRNG unavailable |
