---
title: parseId() — API Reference
layout: layout.njk
---

# parseId()

Parse an ID string into a structured object. Accepts both native better-uuid IDs and legacy RFC UUID strings.

## Signature

```ts
function parseId(id: string): ParsedId;
```

## Return type

```ts
interface ParsedId {
  /** Whether this is a legacy RFC UUID string. */
  legacy: boolean;
  /** Semantic prefix, if present. */
  prefix: string | undefined;
  /** Strategy label. */
  strategy: "uuidv4" | "time" | "ulid" | "nanoid" | "snowflake" | "deterministic" | `unknown(${number})`;
  /** Wire-format schema version (undefined for legacy IDs). */
  schemaVersion: number | undefined;
  /** Timestamp in ms since Unix epoch (if applicable). */
  timestampMs: bigint | undefined;
  /** Hex-encoded payload bytes. */
  entropy: string;
  /** Node identifier (snowflake only). */
  nodeId: number | undefined;
  /** Region slug (snowflake only). */
  region: string | undefined;
}
```

## Examples

### Parse a legacy UUID

```ts
parseId("550e8400-e29b-41d4-a716-446655440000");
// → { legacy: true, strategy: "uuidv4", … }
```

### Parse a UUID v7

```ts
parseId("018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b");
// → { legacy: true, strategy: "time", timestampMs: 1714700319533n, … }
```

### Parse a native better-uuid ID

```ts
parseId("usr_01HZX7K2M3N4P5Q6R7S8T9V0W");
// → {
//     legacy: false,
//     prefix: "usr",
//     strategy: "time",
//     schemaVersion: 1,
//     timestampMs: 1712345678901n,
//     entropy: "018f3c1a7b2d7e3fa4b5c6d7e8f90a1b"
//   }
```

## Errors

Throws `ParseError` if the input doesn't match any known format (native or legacy).

<div class="callout info">
  <p><strong>Hybrid coexistence:</strong> parseId accepts both native and legacy IDs. Old UUID v4 rows return <code>legacy: true</code>; new IDs return full parsed structure.</p>
</div>
