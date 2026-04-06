# better-uuid — Collision Model & Bit Layouts

**Status:** Phase 1 complete — UUID v4 and UUID v7 strategies implemented.
**Companion:** `docs/formats.md`, `ARCHITECTURE.md` §4.3, `PRD.md` §5.0.

---

## 1. UUID v4 (Random)

### Entropy Source

- **122 random bits** from OS CSPRNG (`getrandom` crate → `/dev/urandom` on Linux, `BCryptGenRandom` on Windows, `getentropy` on macOS).
- **No `Math.random`**, no PRNG seeding, no user-space entropy pooling.

### Bit Layout

| Field | Bits | Value |
|-------|------|-------|
| `time_low` | 32 | Random |
| `time_mid` | 16 | Random |
| `version` | 4 | `0100` (4) |
| `time_hi` | 12 | Random |
| `variant` | 2 | `10` |
| `clock_seq` | 14 | Random |
| `node` | 48 | Random |
| **Total** | **128** | **122 random bits** |

### Collision Analysis

- **Birthday bound:** ~50% collision probability at √(2^122) ≈ **2^61 IDs** (2.3 quintillion).
- **Practical risk:** Negligible. Generating 1 billion UUIDs per second would take ~73 years to reach even 1% collision probability.
- **CSPRNG audit:** `getrandom` is the Rust standard for cryptographic randomness, used by `rand`, `ring`, `rustls`.

---

## 2. UUID v7 (Time-Ordered)

### Bit Layout (RFC 9562)

| Field | Bits | Description |
|-------|------|-------------|
| `unix_ts_ms` | 48 | Unix timestamp in milliseconds (big-endian) |
| `ver` | 4 | Version = `0111` (7) |
| `sub_ms_counter` | 12 | Monotonically increasing counter within same ms |
| `var` | 2 | Variant = `10` |
| `rand` | 62 | Cryptographically random |
| **Total** | **128** | **62 random + 12 counter + 48 timestamp + 6 fixed** |

### Entropy Source

- **62 random bits** from OS CSPRNG per new millisecond.
- **12-bit counter** (0–4095) that increments for each ID within the same millisecond.
- **Counter initialization:** Random 11-bit value (0–2047) on each new ms, leaving headroom for burst generation.

### Collision Analysis

- **Within a single ms per process:** Counter provides uniqueness for up to 4096 IDs. Counter starts at a random 0–2047 value, providing ~2048 IDs before overflow.
- **Across processes at the same ms:** 62 random bits → birthday bound at √(2^62) ≈ **2^31 IDs** (~2 billion) per millisecond.
- **Practical risk:** Negligible for single-process. For distributed systems, use the `snowflake` strategy (Phase 3) which adds node/region identity.

### Clock Monotonicity

- **Same-process monotonicity:** Guaranteed by atomic counter. If the OS clock steps backward, the strategy returns `ClockRegressed` error (configurable: `wait`, `error`, or `fallback` to UUID v4).
- **Cross-process ordering:** IDs generated on different machines in the same ms may interleave. Lexicographic ordering ≈ creation time within a single process.

### Sequence Exhaustion

- If more than ~2048 IDs are generated in a single millisecond (after random counter initialization), the strategy returns `SequenceExhausted` error.
- **Never** reuses a `(time, counter)` tuple — the invariant is strictly enforced.
- Caller should handle with retry-on-next-ms or rate limiting.

---

## 3. Wire Format (Native IDs)

### With Prefix

```
<prefix>_<uuid_hex>
```

Example: `usr_018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b`

- **Prefix:** `[a-z0-9]{1,12}`, validated against reserved list (`btr`, `sys`, `_`, `""`).
- **Separator:** `_` (underscore), fixed in v1.
- **Payload:** UUID hex with dashes (`8-4-4-4-12`).

### Without Prefix

```
<uuid_hex>
```

Example: `018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b`

### Length Guarantees

| Strategy | No Prefix | With Max Prefix (12 chars) |
|----------|-----------|---------------------------|
| `uuidv4` | 36 | 49 (`12_` + 36) |
| `time` (UUID v7) | 36 | 49 (`12_` + 36) |

**Stability:** Length is stable within a schema version. Changing the wire format requires a `schemaVersion` bump and is a **semver-major** event.

---

## 4. Schema Versioning

| Version | Library Range | Notes |
|---------|--------------|-------|
| `1` | v1.x | Initial wire format (UUID-shaped with optional prefix) |

Breaking changes to decode logic for a given version = **major semver bump**. Old IDs always remain parseable.

---

*This document is updated when new strategies are implemented or bit layouts change.*
