// ---------------------------------------------------------------------------
// better-uuid — public API surface
// ---------------------------------------------------------------------------

import type {
  BetterUuidConfig,
  CreateIdOptions,
  ParsedId,
  StrategyName,
} from "./types.js";
import { GenerateError } from "./errors.js";

export {
  BetterUuidError,
  GenerateError,
  ParseError,
  type BetterUuidConfig,
  type CreateIdOptions,
  type ParsedId,
  type StrategyName,
} from "./types.js";

// Engine (lazy init)
import { initEngine, getEngineSync, isWasmAvailable } from "./engine/wasm-loader.js";

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
// createId
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
 * @returns Generated ID string (or array of strings if count > 1).
 * @throws {GenerateError} When generation fails (clock regression, etc.).
 */
export function createId(_options?: CreateIdOptions): string | string[] {
  const engine = getEngineSync();

  const strategy = _options?.strategy ?? _config.defaultStrategy ?? "time";
  const prefix = _options?.prefix;
  const mode = _options?.mode;
  const count = _options?.count;

  // Safe mode: force UUID v4, no prefix
  if (mode === "safe") {
    const opts: { strategy: string; count?: number } = { strategy: "uuidv4" };
    if (count !== undefined) opts.count = count;
    return engine.generate(opts);
  }

  // Prefix validation (charset + length + reserved)
  if (prefix !== undefined) {
    if (!/^[a-z0-9]{1,12}$/.test(prefix)) {
      throw new GenerateError(
        `Invalid prefix: "${prefix}" — must be [a-z0-9]{1,12}, not reserved`,
        strategy as StrategyName | undefined,
      );
    }
    const reserved = ["btr", "sys", "_", ""];
    if (reserved.includes(prefix)) {
      throw new GenerateError(
        `Invalid prefix: "${prefix}" — reserved`,
        strategy as StrategyName | undefined,
      );
    }
  }

  const opts: { strategy: string; prefix?: string; count?: number } = { strategy };
  if (prefix !== undefined) opts.prefix = prefix;
  if (count !== undefined) opts.count = count;

  return engine.generate(opts);
}

// ---------------------------------------------------------------------------
// parseId
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
  const engine = getEngineSync();
  return engine.parse(id);
}

// ---------------------------------------------------------------------------
// isLegacyId
// ---------------------------------------------------------------------------

/**
 * Fast check: is this ID a legacy RFC UUID?
 *
 * Useful for metrics, dual-read code paths, and UI branching.
 */
export function isLegacyId(id: string): boolean {
  const engine = getEngineSync();
  return engine.isLegacy(id);
}

// ---------------------------------------------------------------------------
// withIdContext
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
  // Phase 2: pass-through. Phase 5: integrate AsyncLocalStorage.
  return fn();
}

// ---------------------------------------------------------------------------
// WASM status
// ---------------------------------------------------------------------------

/**
 * Check if the WASM engine is active (true) or JS fallback (false).
 */
export function isWasm(): boolean {
  return isWasmAvailable();
}

/**
 * Initialize the WASM engine asynchronously.
 * Call this at app startup for best performance.
 * Falls back to JS automatically if WASM is unavailable.
 */
export async function init(): Promise<void> {
  await initEngine();
}
