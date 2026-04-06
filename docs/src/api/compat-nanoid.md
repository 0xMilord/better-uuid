---
title: compat/nanoid — API Reference
layout: layout.njk
---

# compat/nanoid

Drop-in replacement for the `nanoid` package. Same default behavior: 21-char URL-safe strings.

## Install

```diff
- import { nanoid } from "nanoid";
+ import { nanoid } from "better-uuid/compat/nanoid";
```

## Exports

### `nanoid(size?)`

Generates a URL-safe random ID. Default length: 21.

```ts
import { nanoid } from "better-uuid/compat/nanoid";

nanoid();    // → "V1StGXR8_Z5jdHi6B-myT" (21 chars)
nanoid(10);  // → "3a7kR9xLm2" (10 chars)
```

### `customAlphabet(alphabet, defaultSize?)`

Create a generator with a custom alphabet.

```ts
import { customAlphabet } from "better-uuid/compat/nanoid";

const gen = customAlphabet("ABC123", 8);
gen(); // → "A1B2C3A1"
```
