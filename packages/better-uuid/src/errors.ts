// ---------------------------------------------------------------------------
// better-uuid — Typed error classes
// ---------------------------------------------------------------------------

import type { StrategyName } from "./types";

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

  constructor(message: string, strategy?: StrategyName, details?: Record<string, unknown>) {
    super("GENERATE_ERROR", message);
    this.name = "GenerateError";
    this.strategy = strategy;
    this.details = details;
  }
}
