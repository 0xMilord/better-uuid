---
title: compat/uuid — API Reference
layout: layout.njk
---

# compat/uuid

Drop-in replacement for the `uuid` package. Same API surface as `uuid` v9+.

## Install

```diff
- import { v4 as uuidv4 } from "uuid";
+ import { v4 as uuidv4 } from "better-uuid/compat/uuid";
```

## Exports

### `v4()`

Generates a UUID v4 (random). Same output shape as `uuid` package `v4()`: `8-4-4-4-12` hex.

```ts
import { v4 } from "better-uuid/compat/uuid";
v4(); // → "f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

### `v7()`

Generates a UUID v7 (time-ordered). Same output shape as `uuid` package `v7()`.

```ts
import { v7 } from "better-uuid/compat/uuid";
v7(); // → "018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b"
```

### `validate(id)`

Returns `true` for valid UUID v4/v7-shaped strings.

### `NIL`

The zero UUID: `00000000-0000-0000-0000-000000000000`.
