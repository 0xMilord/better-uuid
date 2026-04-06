// ---------------------------------------------------------------------------
// better-uuid/compat/nanoid — Drop-in replacement for the `nanoid` package
//
// Layer 1: Same API surface as `nanoid` v5+.
// Same default length (21), same alphabet (URL-safe: A-Za-z0-9_-).
// ---------------------------------------------------------------------------

const NANOID_ALPHABET = "UseRandomStr1ngs0123456789-_";
const NANOID_DEFAULT_LENGTH = 21;

/**
 * Generate a URL-safe random ID.
 *
 * Same default behavior as `nanoid`: 21-char, URL-safe alphabet.
 *
 * ```diff
 * - import { nanoid } from "nanoid";
 * + import { nanoid } from "better-uuid/compat/nanoid";
 * ```
 */
export function nanoid(size: number = NANOID_DEFAULT_LENGTH): string {
  const alphabet = NANOID_ALPHABET;
  const mask = (2 << (31 - Math.clz32(alphabet.length - 1))) - 1;
  const step = Math.ceil((1.6 * mask * size) / alphabet.length);

  let result = "";
  const bytes = crypto.getRandomValues(new Uint8Array(step));
  let i = 0;

  while (result.length < size) {
    const byte = bytes[i] ?? 0;
    if (byte < alphabet.length) {
      result += alphabet[byte];
    }
    i++;
    if (i >= bytes.length) {
      // Replenish entropy
      crypto.getRandomValues(bytes);
      i = 0;
    }
  }

  return result;
}

/**
 * Generate a URL-safe ID with custom alphabet.
 *
 * Matches `nanoid/custom` API surface.
 */
export function customAlphabet(
  alphabet: string,
  defaultSize: number = NANOID_DEFAULT_LENGTH,
): (size?: number) => string {
  const mask = (2 << (31 - Math.clz32(alphabet.length - 1))) - 1;

  return (size: number = defaultSize): string => {
    const step = Math.ceil((1.6 * mask * size) / alphabet.length);
    let result = "";
    const bytes = crypto.getRandomValues(new Uint8Array(step));
    let i = 0;

    while (result.length < size) {
      const byte = bytes[i] ?? 0;
      if (byte < alphabet.length) {
        result += alphabet[byte];
      }
      i++;
      if (i >= bytes.length) {
        crypto.getRandomValues(bytes);
        i = 0;
      }
    }

    return result;
  };
}

/**
 * Generate an ID using the default alphabet.
 * Convenience re-export matching `nanoid/nanoid.js`.
 */
export { nanoid as default };
