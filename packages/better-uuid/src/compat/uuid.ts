// ---------------------------------------------------------------------------
// better-uuid/compat/uuid — Drop-in replacement for the `uuid` package
//
// Layer 1: Same API surface as `uuid` v9+.
// Teams replace the import; behavior is unchanged until they flip strategy.
// ---------------------------------------------------------------------------

import { createId, parseId } from "../index";

/**
 * Generate a UUID v4 (random).
 *
 * Same output shape as `uuid` package `v4()`: `8-4-4-4-12` hex.
 *
 * ```diff
 * - import { v4 as uuidv4 } from "uuid";
 * + import { v4 as uuidv4 } from "better-uuid/compat/uuid";
 * ```
 */
export function v4(): string {
  return createId({ strategy: "uuidv4", mode: "safe" }) as string;
}

/**
 * Generate a UUID v7 (time-ordered).
 *
 * Same output shape as `uuid` package `v7()`: `8-4-4-4-12` hex.
 */
export function v7(): string {
  // v7 via the engine — returns UUID-shaped (safe mode strips prefix)
  const id = createId({ strategy: "time" }) as string;
  // If engine returns native with prefix, we need RFC shape
  // For Phase 2: time strategy returns UUID v7 format without prefix
  if (id.includes("_")) {
    return id.split("_")[1]!;
  }
  return id;
}

/** Validate an ID string. Returns true for valid UUID v4/v7-shaped strings. */
export function validate(id: string): boolean {
  try {
    const parsed = parseId(id);
    return (
      parsed.legacy &&
      (parsed.strategy === "uuidv4" || parsed.strategy === "time")
    );
  } catch {
    return false;
  }
}

/** No-op for compat — the `uuid` package exports this. */
export const NIL = "00000000-0000-0000-0000-000000000000";

/** Parse UUID string to byte array (16 bytes). */
export function parse(id: string): Uint8Array {
  const hex = id.replace(/-/g, "");
  if (hex.length !== 32) {
    throw new Error("Invalid UUID");
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Convert byte array (16 bytes) to UUID string. */
export function stringify(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new Error("Invalid byte array length, expected 16");
  }
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return (
    h(bytes[0]!) + h(bytes[1]!) + h(bytes[2]!) + h(bytes[3]!) + "-" +
    h(bytes[4]!) + h(bytes[5]!) + "-" +
    h(bytes[6]!) + h(bytes[7]!) + "-" +
    h(bytes[8]!) + h(bytes[9]!) + "-" +
    h(bytes[10]!) + h(bytes[11]!) + h(bytes[12]!) + h(bytes[13]!) + h(bytes[14]!) + h(bytes[15]!)
  );
}

/** v1 (not implemented) — delegates to v4 for compat. */
export const v1 = v4;

/** Default export matches the `uuid` package's default (v4). */
export default v4;
