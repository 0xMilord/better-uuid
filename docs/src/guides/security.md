---
title: Security — Deep Dive
layout: layout.njk
---

# Security Model

How better-uuid handles randomness, deterministic IDs, and monkey-patching.

## Randomness

| Topic | Approach |
|-------|----------|
| **Source** | OS CSPRNG only — `getrandom` (Rust) / `crypto.getRandomValues` (JS) |
| **Never** | `Math.random()`, user-space PRNG, or seedable generators |
| **Entropy audit** | `getrandom` is the Rust standard for cryptographic randomness, used by `rand`, `ring`, `rustls` |

## Deterministic IDs

Deterministic mode (`createId({ input: "user@email.com" })`) hashes stable input to produce the same ID across restarts.

**Threat model:**

- Hashes of small/enumerable input spaces are **guessable** via brute force.
- **Do not use** deterministic IDs for public-facing identifiers when input is enumerable (e.g. sequential user IDs, email addresses).
- **Mitigation:** Use salted hash option (application salt mixed into hash) to prevent rainbow tables.

## Monkey-patch module

`better-uuid/patch` replaces `crypto.randomUUID()` globally.

<div class="callout danger">
  <p><strong>High risk:</strong> This changes behavior for <em>every</em> consumer in the process — including transitive dependencies. Forbidden in shared libraries. Audit-only in applications.</p>
</div>

**Safeguards:**

- Requires `BETTER_UUID_PATCH=1` environment variable
- Logs exactly once at startup
- No silent activation

## Prefix validation

| Rule | Value |
|------|-------|
| **Charset** | `[a-z0-9]` only |
| **Max length** | 12 characters |
| **Reserved** | `btr`, `sys`, `_`, empty string |

Maliciously long prefixes are rejected at the API boundary with a clear error.

## Timing side channels

Not security-critical for ID generation — documented but not mitigated. Parse operations may leak string length via timing.
