// ---------------------------------------------------------------------------
// better-uuid — public API surface
// ---------------------------------------------------------------------------

import type {
  BetterUuidConfig,
  CreateIdOptions,
  ParseError,
  ParsedId,
  StrategyName,
} from "./types";

export {
  BetterUuidError,
  GenerateError,
  type BetterUuidConfig,
  type CreateIdOptions,
  type ParseError,
  type ParsedId,
  type StrategyName,
} from "./types";

// ---------------------------------------------------------------------------
// Module singleton — stores org-wide defaults from createId.configure()
// ---------------------------------------------------------------------------

let _config: BetterUuidConfig = {
  defaultStrategy: "time",
};

/**
 * Set company-wide defaults. Call once at app bootstrap.
 *
 * ```ts
 * createId.configure({
 *   defaultStrategy: "time",
 *   prefixes: { user: "usr", order: "ord" },
 *   strict: true,
 * });
 * ```
 */
export function configure(config: BetterUuidConfig): void {
  _config = { ..._config, ...config };
}

/** Internal accessor for test mocks — not public API. */
export function _getConfig(): BetterUuidConfig {
  return { ..._config };
}

/** Internal reset for test isolation — not public API. */
export function _resetConfig(): void {
  _config = { defaultStrategy: "time" };
}

// ---------------------------------------------------------------------------
// Placeholder generation (Phase 1: wired to WASM)
// ---------------------------------------------------------------------------

/**
 * Generate a structured, inspectable ID.
 *
 * ```ts
 * createId({ strategy: "time", prefix: "usr" });
 * // → "usr_01HZX7K2M3N4P5Q6R7S8T9V0W"
 * ```
 *
 * @param options - Strategy, prefix, and policy overrides.
 * @returns Generated ID string.
 * @throws {GenerateError} When generation fails (clock regression, etc.).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createId(_options?: CreateIdOptions): string {
  // Phase 0 placeholder — wired to WASM/JS engine in Phase 1–2.
  const strategy = _options?.strategy ?? _config.defaultStrategy ?? "time";
  const prefix = _options?.prefix;

  // Generate a realistic placeholder for DX during Phase 0
  // This will be replaced by real WASM calls in Phase 1
  const randomHex = globalThis.crypto.randomUUID().replace(/-/g, "");
  const payload = prefix ? `${prefix}_${randomHex}` : randomHex;

  if (_options?.mode === "safe") {
    // Safe mode: return UUID-shaped ID
    return globalThis.crypto.randomUUID();
  }

  // Tag with strategy for parseId demo
  return `[${strategy}]${payload}`;
}

// ---------------------------------------------------------------------------
// Placeholder parse (Phase 2: wired to WASM)
// ---------------------------------------------------------------------------

/**
 * Parse an ID string into a structured object.
 *
 * Accepts both native better-uuid IDs and legacy RFC UUID strings.
 *
 * ```ts
 * parseId("550e8400-e29b-41d4-a716-446655440000");
 * // → { legacy: true, strategy: "uuidv4", … }
 *
 * parseId("usr_01HZX7K2M3N4P5Q6R7S8T9V0W");
 * // → { prefix: "usr", strategy: "time", legacy: false, … }
 * ```
 *
 * @param id - ID string to parse.
 * @returns Structured `ParsedId` object.
 * @throws {ParseError} When the input doesn't match any known format.
 */
export function parseId(id: string): ParsedId {
  // Phase 0: legacy UUID detection works; native parsing wired in Phase 2

  // Check for legacy RFC UUID format (8-4-4-4-12 hex)
  const legacyUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-([0-9a-f])[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const match = id.match(legacyUuidRegex);

  if (match) {
    const versionNibble = match[1];
    let strategy: StrategyName = `unknown(${Number.parseInt(versionNibble, 16)})`;
    if (versionNibble === "4") strategy = "uuidv4";
    if (versionNibble === "7") strategy = "time";

    return {
      legacy: true,
      prefix: undefined,
      strategy,
      schemaVersion: undefined,
      timestampMs: undefined,
      entropy: id.replace(/-/g, ""),
      nodeId: undefined,
      region: undefined,
    };
  }

  // Native better-uuid format: [strategy]prefix_payload
  const nativeMatch = id.match(/^\[(\w+)\]((\w+)_)?([0-9a-f]+)$/i);
  if (nativeMatch) {
    const rawStrategy = nativeMatch[1];
    const rawPrefix = nativeMatch[3];
    const payload = nativeMatch[4];
    return {
      legacy: false,
      prefix: rawPrefix,
      strategy: rawStrategy as StrategyName,
      schemaVersion: 1,
      timestampMs: undefined,
      entropy: payload ?? "",
      nodeId: undefined,
      region: undefined,
    };
  }

  // Fallback: reject
  throw new Error(
    `Invalid format: "${id.slice(0, 20)}" — not a recognized better-uuid or legacy UUID format`,
  );
}

// ---------------------------------------------------------------------------
// isLegacyId helper
// ---------------------------------------------------------------------------

/**
 * Fast check: is this ID a legacy RFC UUID?
 *
 * Useful for metrics, dual-read code paths, and UI branching.
 */
export function isLegacyId(id: string): boolean {
  try {
    return parseId(id).legacy;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// withIdContext (AsyncLocalStorage-based request scoping)
// ---------------------------------------------------------------------------

type IdContext = Record<string, string | undefined>;

/**
 * Run a function with request-scoped ID context.
 *
 * ```ts
 * withIdContext({ requestId: "req_abc", sessionId: "sess_xyz" }, () => {
 *   createId(); // context flows through automatically
 * });
 * ```
 *
 * In Edge runtimes where `AsyncLocalStorage` is unavailable, this is a
 * pass-through that still executes `fn()`.
 *
 * @param ctx - Key-value context (requestId, sessionId, etc.).
 * @param fn - Function to execute within context scope.
 * @returns The return value of `fn()`.
 */
export function withIdContext<T>(_ctx: IdContext, fn: () => T): T {
  // Phase 2: will integrate with AsyncLocalStorage for Node.js
  // and equivalent patterns for Edge runtimes.
  // For Phase 0, this is a pass-through that executes fn().
  return fn();
}

/**
 * Get the current request context (for internal use).
 * Returns undefined if called outside `withIdContext`.
 */
export function _getCurrentContext(): IdContext | undefined {
  return undefined;
}
