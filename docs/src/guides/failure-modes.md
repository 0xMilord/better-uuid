---
title: Failure Modes — Deep Dive
layout: layout.njk
---

# Failure Modes

How better-uuid fails — and what you should do about it.

## Clock regression (snowflake / time-ordered)

**What:** OS clock moved backward compared to the last-issued timestamp.

**How it looks:**

```ts
createId({
  strategy: "snowflake",
  onClockRegression: "fallback",
});
```

If the clock stepped back and policy is `fallback`:

```json
{
  "warning": "Clock regression detected",
  "action": "Emitted uuidv4 fallback for this ID",
  "policy": "fallback"
}
```

**Policies:**

| Policy | Behavior | When to use |
|--------|----------|------------|
| `wait` | Block until `now >= last_ts` (with timeout cap) | Acceptable latency, strong ordering needed |
| `error` | Throw `ClockRegressed` → your app returns 503 | Fast-fail, retry with backoff |
| `fallback` | Emit UUID v4 + log warning | Availability > ordering |

## Sequence exhaustion

**What:** More IDs generated in one ms than the counter allows.

**Policies:**

| Policy | Behavior |
|--------|----------|
| `error` | Throw `SequenceExhausted` → retry next ms |
| `wait` | Block until next millisecond |

**Never** reuses a `(time, node, seq)` tuple. That's the invariant.

## WASM load failure

```json
{
  "level": "error",
  "event": "WasmLoadFailed",
  "message": "WebAssembly.instantiate failed",
  "fallback": "JS fallback available for uuidv4, nanoid strategies"
}
```

**Cause:** CSP policy blocking `application/wasm`, missing binary, or runtime without WASM support.

**Mitigation:** Pure JS fallback for uuidv4 and nanoid strategies (Phase 4).

## Invalid prefix

**What:** Prefix fails charset (`[a-z0-9]`), length (≤12), or reserved list check.

**Example:**

```ts
createId({ prefix: "User-ID" }); // throws InvalidPrefix: contains characters outside [a-z0-9]
createId({ prefix: "btr" });     // throws InvalidPrefix: reserved
createId({ prefix: "" });        // throws InvalidPrefix: empty or reserved
```

<div class="callout info">
  <p><strong>Rule:</strong> All errors are typed. No stack-less throws for control flow. Every error carries enough context for actionable debugging.</p>
</div>
