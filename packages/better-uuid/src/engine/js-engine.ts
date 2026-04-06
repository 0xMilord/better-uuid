// ---------------------------------------------------------------------------
// better-uuid — Pure JavaScript engine (WASM fallback)
//
// Real implementation using crypto.getRandomValues() — NO Math.random().
// Provides identical API to the WASM engine for seamless fallback.
// ---------------------------------------------------------------------------

import type { ParsedId, StrategyName, GenerateError, ParseError } from "./types";
import { BetterUuidError, GenerateError as GenErr, ParseError as ParsErr } from "./errors";

// ---------------------------------------------------------------------------
// UUID v4 generation (122 CSPRNG bits)
// ---------------------------------------------------------------------------

function generateV4(): string {
  const bytes = cryptoGetRandom(16);
  // Version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Variant 10
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

// ---------------------------------------------------------------------------
// UUID v7 generation (RFC 9562)
//
// 48-bit timestamp + 4-bit version + 12-bit counter + 2-bit variant + 62-bit random
// ---------------------------------------------------------------------------

let _v7LastTs = 0;
let _v7Counter = 0;

function generateV7(nowMs: number): string {
  if (nowMs < _v7LastTs) {
    // Clock regression — emit v4 fallback to avoid duplicates
    return generateV4();
  }

  let counter: number;
  if (nowMs > _v7LastTs) {
    // New millisecond — random counter start (11 bits = 0-2047)
    const rand = cryptoGetRandom(2);
    counter = ((rand[0] << 3) | (rand[1] >> 5)) & 0x7ff;
    _v7LastTs = nowMs;
    _v7Counter = counter;
  } else {
    counter = _v7Counter + 1;
    if (counter > 0x7ff) {
      // Counter overflow — emit v4 to avoid duplicates
      return generateV4();
    }
    _v7Counter = counter;
  }

  const bytes = cryptoGetRandom(16);

  // Bytes 0-5: 48-bit timestamp (big-endian)
  bytes[0] = (nowMs / 2 ** 40) & 0xff;
  bytes[1] = (nowMs / 2 ** 32) & 0xff;
  bytes[2] = (nowMs / 2 ** 24) & 0xff;
  bytes[3] = (nowMs / 2 ** 16) & 0xff;
  bytes[4] = (nowMs / 2 ** 8) & 0xff;
  bytes[5] = nowMs & 0xff;

  // Byte 6: version 7 (top nibble) + counter top 4 bits
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f);

  // Byte 7: counter bottom 8 bits
  bytes[7] = counter & 0xff;

  // Byte 8: variant 10 (top 2 bits) + random
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuid(bytes);
}

// ---------------------------------------------------------------------------
// Formatting / parsing
// ---------------------------------------------------------------------------

function formatUuid(bytes: Uint8Array): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return (
    h(bytes[0]) + h(bytes[1]) + h(bytes[2]) + h(bytes[3]) + "-" +
    h(bytes[4]) + h(bytes[5]) + "-" +
    h(bytes[6]) + h(bytes[7]) + "-" +
    h(bytes[8]) + h(bytes[9]) + "-" +
    h(bytes[10]) + h(bytes[11]) + h(bytes[12]) + h(bytes[13]) + h(bytes[14]) + h(bytes[15])
  );
}

function parseUuidHex(s: string): Uint8Array | null {
  if (s.length !== 36) return null;
  const b = new Uint8Array(16);
  const hex = s.replace(/-/g, "");
  if (hex.length !== 32) return null;
  for (let i = 0; i < 16; i++) {
    const v = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(v)) return null;
    b[i] = v;
  }
  return b;
}

// ---------------------------------------------------------------------------
// CSPRNG
// ---------------------------------------------------------------------------

function cryptoGetRandom(len: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new BetterUuidError(
      "ENTROPY_UNAVAILABLE",
      "crypto.getRandomValues is not available — cannot generate secure IDs",
    );
  }
  const buf = new Uint8Array(len);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

// ---------------------------------------------------------------------------
// Legacy detection
// ---------------------------------------------------------------------------

const LEGACY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-([0-9a-f])[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isLegacyUuid(s: string): boolean {
  return LEGACY_UUID_RE.test(s);
}

// ---------------------------------------------------------------------------
// Public engine interface
// ---------------------------------------------------------------------------

export interface JsEngine {
  generate(options: {
    strategy?: string;
    prefix?: string;
    mode?: string;
    count?: number;
  }): string | string[];
  parse(id: string): ParsedId;
  isLegacy(id: string): boolean;
}

export function createJsEngine(): JsEngine {
  return {
    generate(opts) {
      const strategy = opts.strategy ?? "time";
      const prefix = opts.prefix;
      const mode = opts.mode;
      const count = opts.count ?? 1;

      // Safe mode: force UUID v4, no prefix
      if (mode === "safe") {
        if (count > 1) return Array.from({ length: count }, () => generateV4());
        return generateV4();
      }

      const gen = (): string => {
        const nowMs = Date.now();
        let id: string;
        if (strategy === "uuidv4" || strategy === "v4") {
          id = generateV4();
        } else if (strategy === "time" || strategy === "v7" || strategy === "uuidv7") {
          id = generateV7(nowMs);
        } else {
          throw new GenErr(
            `Unsupported strategy: "${strategy}"`,
            strategy as StrategyName | undefined,
          );
        }
        return prefix ? `${prefix}_${id}` : id;
      };

      if (count > 1) return Array.from({ length: count }, gen);
      return gen();
    },

    parse(id: string): ParsedId {
      // Native ID: has prefix separator
      if (id.includes("_")) {
        const sepPos = id.indexOf("_");
        const prefix = id.slice(0, sepPos);
        const body = id.slice(sepPos + 1);

        // Validate prefix
        if (!/^[a-z0-9]{1,12}$/.test(prefix)) {
          throw new ParsErr(`Invalid prefix: "${prefix}"`, 0, prefix);
        }

        const bytes = parseUuidHex(body);
        if (!bytes) {
          throw new ParsErr(`Invalid format: "${id.slice(0, 20)}"`, 0, id.slice(0, 20));
        }

        const versionNibble = body[14]?.toUpperCase();
        const variantNibble = body[19]?.toUpperCase();
        if (!["8", "9", "A", "B"].includes(variantNibble ?? "")) {
          throw new ParsErr(`Invalid format: "${id.slice(0, 20)}"`, 0, id.slice(0, 20));
        }

        let strategy: StrategyName = "uuidv4";
        let timestampMs: bigint | undefined;

        if (versionNibble === "7") {
          strategy = "time";
          // Extract 48-bit timestamp from first 6 bytes
          const hex = body.slice(0, 8) + body.slice(9, 13);
          timestampMs = BigInt(Number.parseInt(hex, 16));
        } else if (versionNibble === "4") {
          strategy = "uuidv4";
        } else {
          strategy = `unknown(${versionNibble ?? "?"})` as StrategyName;
        }

        return {
          legacy: false,
          prefix,
          strategy,
          schemaVersion: 1,
          timestampMs,
          entropy: body.replace(/-/g, ""),
          nodeId: undefined,
          region: undefined,
        };
      }

      // Legacy UUID
      if (isLegacyUuid(id)) {
        const version = id[14]?.toLowerCase();
        let strategy: StrategyName = "uuidv4";
        let timestampMs: bigint | undefined;

        if (version === "7") {
          strategy = "time";
          const hex = id.slice(0, 8) + id.slice(9, 13);
          timestampMs = BigInt(Number.parseInt(hex, 16));
        } else if (version === "4") {
          strategy = "uuidv4";
        } else {
          strategy = `unknown(${version ?? "?"})` as StrategyName;
        }

        return {
          legacy: true,
          prefix: undefined,
          strategy,
          schemaVersion: undefined,
          timestampMs,
          entropy: id.replace(/-/g, ""),
          nodeId: undefined,
          region: undefined,
        };
      }

      throw new ParsErr(
        `Invalid format: "${id.slice(0, 20)}"`,
        0,
        id.slice(0, 20),
      );
    },

    isLegacy(id: string): boolean {
      return isLegacyUuid(id);
    },
  };
}
