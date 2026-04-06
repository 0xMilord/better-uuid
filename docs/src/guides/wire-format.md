---
title: Wire Format — Deep Dive
layout: layout.njk
---

# Wire Format

How better-uuid IDs are structured on the wire.

## Native IDs (v1)

### With prefix

```
<prefix>_<uuid_hex>
```

Example: `usr_018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b`

### Without prefix

```
<uuid_hex>
```

Example: `018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b`

## Rules

| Component | Constraint |
|-----------|-----------|
| **Prefix** | `[a-z0-9]{1,12}`, not reserved (`btr`, `sys`, `_`, `""`) |
| **Separator** | `_` (underscore), fixed in v1 |
| **Payload** | RFC 4122 hex with dashes (`8-4-4-4-12`) for v4/v7 |

## Length guarantees

| Strategy | No prefix | With max prefix (12 chars) |
|----------|-----------|---------------------------|
| `uuidv4` | 36 | 49 |
| `time` (UUID v7) | 36 | 49 |

**Stability:** Length is stable within a schema version. Changing wire format = semver-major bump.

## Schema versioning

| Version | Library | Notes |
|---------|---------|-------|
| `1` | v1.x | Initial wire format (UUID-shaped with optional prefix) |

Breaking changes to decode logic for a given version = **major semver bump**. Old IDs always remain parseable.
