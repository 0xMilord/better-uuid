---
title: isLegacyId() — API Reference
layout: layout.njk
---

# isLegacyId()

Fast check: is this ID a legacy RFC UUID?

## Signature

```ts
function isLegacyId(id: string): boolean;
```

## Examples

```ts
isLegacyId("550e8400-e29b-41d4-a716-446655440000");
// → true

isLegacyId("usr_01HZX7K2M3N4P5Q6R7S8T9V0W");
// → false

isLegacyId("definitely-not-an-id");
// → false
```

## Use cases

- Metrics: track % of legacy vs native IDs in your system
- UI branching: show different badges for legacy vs new IDs
- Dual-read code paths: fall back to legacy column when `newId` is null
