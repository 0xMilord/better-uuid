# better-uuid — Wire Format & Encoding Specs

**Status:** 🚧 Stub — Phase 0 deliverable (ROADMAP.md). Exact bit layouts TBD during core design review.

---

## 1. Canonical wire format (v1)

```
<prefix>_<strategy_byte>_<schema_byte>_<payload_b32_or_b58>_<optional_checksum>
```

- **Separator:** `_` (underscore) in v1. Not configurable.
- **Prefix charset:** `[a-z0-9]{1,12}` (hard cap; PRD §5.7).
- **Payload encoding:** Crockford base32 by default; base58 for strategies that opt in.
- **Endianness:** Big-endian for human-stable hex dumps (ARCHITECTURE.md §4.3).

## 2. Alphabet reference

### 2.1 Crockford Base32 (default display)

| Symbol | Value | Notes |
|--------|-------|-------|
| `0-9` | 0–9 | |
| `A-H` `J-K` `M-N` `P-T` `V-X` | 10–31 | Omits `I`, `L`, `O`, `U` (Crockford rules) |

**Case-insensitive:** `a` == `A`. Normalized to uppercase on parse.

### 2.2 Base58 (optional, PRD A2)

`123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`

- No `0`, `O`, `I`, `l`.
- Used for compressed forms and `nanoid`-class strategies when specified.

### 2.3 Hex (UUID-shaped strategies)

`0-9a-f` with dashes at `8-4-4-4-12` positions for `uuidv4` and `time` (RFC UUID v7 form).

## 3. Strategy bit layouts

### 3.1 UUID v4 (`uuidv4`, strategy `0x00`)

| Field | Bits | Value |
|-------|------|-------|
| `random` | 122 | CSPRNG |
| `version` | 4 | `0100` |
| `variant` | 2 | `10` |

**Output:** RFC 4122 `8-4-4-4-12` hex. No prefix by default.

### 3.2 UUID v7 (`time`, strategy `0x01`)

| Field | Bits | Value |
|-------|------|-------|
| `unix_ts_ms` | 48 | Unix epoch milliseconds (big-endian) |
| `version` | 4 | `0111` |
| `sub_ms_counter` | 12 | Monotonic counter (0–4095) |
| `variant` | 2 | `10` |
| `random` | 62 | CSPRNG |

**Output:** RFC 9562 `8-4-4-4-12` hex. Optional prefix prepended.

### 3.3 Future strategies (Phase 3+)

| Strategy | Doc | Status |
|----------|-----|--------|
| `ulid` | — | TBD |
| `nanoid` | — | TBD |
| `snowflake` | — | TBD |
| `deterministic` | — | TBD |

## 4. Schema versioning

| Version | Library range | Notes |
|---------|--------------|-------|
| `1` | v1.x | Initial wire format |

Breaking changes to decode logic for a given version = **major semver bump** (ARCHITECTURE.md §8.4).

## 5. ID length table (DB column sizing)

See PRD §5.3 for the normative table. Summary:

| Strategy | Typical length | DB type |
|----------|---------------|---------|
| `uuidv4` / `time` (UUID-shaped) | 36 | `CHAR(36)` / `UUID` |
| `time` + prefix | ~42–54 | `VARCHAR(64)` |
| `ulid` | 26 | `CHAR(26)` |
| `nanoid` (21) | 21 | `VARCHAR(N)` |
| `snowflake` | ~28–46 | `VARCHAR(48)` |

---

*This file is a living spec. Update it when the Rust core wire format is finalized.*
