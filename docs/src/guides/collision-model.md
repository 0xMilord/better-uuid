---
title: Collision Model — Deep Dive
layout: layout.njk
---

# Collision Model

Entropy bits, birthday bounds, and CSPRNG audit for each strategy.

## UUID v4 (Random)

### Entropy source

- **122 random bits** from OS CSPRNG (`getrandom` crate → `/dev/urandom` on Linux, `BCryptGenRandom` on Windows, `getentropy` on macOS).
- **No `Math.random`**, no PRNG seeding, no user-space entropy pooling.

### Bit layout

| Field | Bits | Value |
|-------|------|-------|
| `time_low` | 32 | Random |
| `time_mid` | 16 | Random |
| `version` | 4 | `0100` (4) |
| `time_hi` | 12 | Random |
| `variant` | 2 | `10` |
| `clock_seq` | 14 | Random |
| `node` | 48 | Random |

### Collision analysis

- **Birthday bound:** ~50% collision probability at √(2^122) ≈ **2^61 IDs** (2.3 quintillion).
- **Practical risk:** Negligible. Generating 1 billion UUIDs/sec for 73 years → still under 1% collision probability.

## UUID v7 (Time-Ordered)

### Bit layout (RFC 9562)

| Field | Bits | Description |
|-------|------|-------------|
| `unix_ts_ms` | 48 | Unix epoch milliseconds (big-endian) |
| `ver` | 4 | Version = `0111` (7) |
| `sub_ms_counter` | 12 | Monotonically increasing counter (0–4095) |
| `var` | 2 | Variant = `10` |
| `rand` | 62 | Cryptographically random |

### Entropy source

- **62 random bits** from OS CSPRNG per new millisecond.
- **12-bit counter** (0–4095) that increments for each ID within the same ms.
- **Counter init:** Random 11-bit value (0–2047) on each new ms.

### Collision analysis

- **Within a single ms per process:** Counter provides uniqueness for up to ~2048 IDs (random start leaves headroom).
- **Across processes at the same ms:** 62 random bits → birthday bound at √(2^62) ≈ **2^31 IDs** (~2 billion) per ms.
- **Practical risk:** Negligible for single-process. For distributed, use `snowflake` (Phase 3).

### Clock monotonicity

- **Same-process:** Guaranteed by atomic counter. Clock step-back → `ClockRegressed` error.
- **Cross-process:** IDs from different machines in the same ms may interleave.

## DB column sizing

| Strategy | Recommended type | Max length |
|----------|-----------------|------------|
| `uuidv4` / `time` (no prefix) | `CHAR(36)` or `UUID` | 36 |
| `time` + prefix (`usr_`) | `VARCHAR(64)` | 49 (with 12-char prefix) |
