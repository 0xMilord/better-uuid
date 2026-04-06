// ---------------------------------------------------------------------------
// better-uuid/compat/uuid — Drop-in replacement for the `uuid` package
//
// Layer 1: Same API surface as `uuid` v9+.
// Teams replace the import; behavior is unchanged until they flip strategy.
// ---------------------------------------------------------------------------

import { createId } from "../index";

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
  return createId({ strategy: "uuidv4", mode: "safe" });
}

/**
 * Generate a UUID v7 (time-ordered).
 *
 * Same output shape as `uuid` package `v7()`: `8-4-4-4-12` hex.
 */
export function v7(): string {
  return createId({ strategy: "time", mode: "safe" });
}

/** Validate an ID string. Always true for v4/v7-shaped strings. */
export function validate(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** No-op for compat — the `uuid` package exports this. */
export const NIL = "00000000-0000-0000-0000-000000000000";

/** No-op for compat — the `uuid` package exports this. */
export const parse = (_id: string): Uint8Array => new Uint8Array(16);

/** No-op for compat — the `uuid` package exports this. */
export const stringify = (_bytes: Uint8Array): string => NIL;

/** No-op for compat — the `uuid` package exports this. */
export const v1 = v4; // v1 not implemented yet; delegate to v4

/** Default export matches the `uuid` package's default (v4). */
export default v4;
