// ---------------------------------------------------------------------------
// Public types for better-uuid
// ---------------------------------------------------------------------------

/** Discriminated strategy names matching the Rust wire format. */
export type StrategyName =
  | "uuidv4"
  | "time"
  | "ulid"
  | "nanoid"
  | "snowflake"
  | "deterministic"
  | `unknown(${string})`;

/** Options for `createId()`. */
export interface CreateIdOptions {
  /** ID generation strategy. Defaults to configured `defaultStrategy`. */
  strategy?: StrategyName;

  /** Semantic prefix (e.g. "usr", "ord"). Validated against `[a-z0-9]{1,12}`. */
  prefix?: string;

  /**
   * Safe mode: enforce UUID-shaped output (36-char, `8-4-4-4-12` hex),
   * no custom prefix. Answers "nothing surprising changed."
   */
  mode?: "safe";

  /** Snowflake: unique node identifier (0–1023). */
  node?: number;

  /** Snowflake: region slug (e.g. "in-west"). */
  region?: string;

  /** Snowflake: behavior on clock regression. */
  onClockRegression?: "wait" | "error" | "fallback";

  /** Snowflake: behavior on sequence overflow. */
  onSequenceExhausted?: "wait" | "error";

  /** Generate N IDs in a single call (batch API for seeding/load testing). */
  count?: number;
}

/** Structured parse result — unified for native and legacy IDs. */
export interface ParsedId {
  /** Whether this is a legacy RFC UUID string. */
  legacy: boolean;

  /** Semantic prefix, if present. */
  prefix: string | undefined;

  /** Strategy label (e.g. "uuidv4", "time", "ulid"). */
  strategy: StrategyName;

  /** Wire-format schema version (undefined for legacy IDs). */
  schemaVersion: number | undefined;

  /** Timestamp in ms since Unix epoch (if applicable). */
  timestampMs: bigint | undefined;

  /** Hex-encoded payload bytes. */
  entropy: string;

  /** Node identifier (snowflake strategies only). */
  nodeId: number | undefined;

  /** Region slug (snowflake strategies only). */
  region: string | undefined;
}

/** Company-wide configuration set via `createId.configure()`. */
export interface BetterUuidConfig {
  /** Default strategy for calls that don't specify one. */
  defaultStrategy?: StrategyName;

  /** Named prefix map (e.g. `{ user: "usr", order: "ord" }`). */
  prefixes?: Record<string, string>;

  /**
   * Strict mode: reject unknown prefix+strategy combinations.
   * Useful for org-wide enforcement via code review.
   */
  strict?: boolean;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Base error for all better-uuid exceptions. */
export class BetterUuidError extends Error {
  public readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BetterUuidError";
    this.code = code;
  }
}

/** Parse failure with position and safe snippet context. */
export class ParseError extends BetterUuidError {
  public readonly position: number;
  public readonly snippet: string;

  constructor(message: string, position: number, snippet: string, options?: ErrorOptions) {
    super("PARSE_ERROR", message, options);
    this.name = "ParseError";
    this.position = position;
    this.snippet = snippet;
  }
}

/** Generation failure with strategy-specific context. */
export class GenerateError extends BetterUuidError {
  public readonly strategy: StrategyName | undefined;
  public readonly details: Record<string, unknown> | undefined;

  constructor(
    message: string,
    strategy?: StrategyName,
    details?: Record<string, unknown>,
  ) {
    super("GENERATE_ERROR", message);
    this.name = "GenerateError";
    this.strategy = strategy;
    this.details = details;
  }
}
