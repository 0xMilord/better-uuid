import { describe, it, expect, beforeEach } from "vitest";
import {
  createId,
  parseId,
  isLegacyId,
  configure,
  _getConfig,
  _resetConfig,
  withIdContext,
  isWasm,
  init,
} from "./index.js";
import { GenerateError, ParseError, BetterUuidError } from "./errors.js";

// ---------------------------------------------------------------------------
// createId — unit tests
// ---------------------------------------------------------------------------

describe("createId", () => {
  beforeEach(() => {
    _resetConfig();
  });

  it("returns a string by default", () => {
    const id = createId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("generates UUID v4 format when strategy=uuidv4", () => {
    const id = createId({ strategy: "uuidv4" }) as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("generates UUID v7 format when strategy=time", () => {
    const id = createId({ strategy: "time" }) as string;
    // JS engine returns UUID v7 without prefix
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("prepends prefix to generated ID", () => {
    const id = createId({ prefix: "usr", strategy: "uuidv4" }) as string;
    expect(id.startsWith("usr_")).toBe(true);
    expect(id).toMatch(/^usr_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("safe mode returns UUID v4 shape without prefix", () => {
    const id = createId({ mode: "safe" }) as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("throws on reserved prefix", () => {
    expect(() => createId({ prefix: "btr" })).toThrow(GenerateError);
    expect(() => createId({ prefix: "sys" })).toThrow(GenerateError);
    expect(() => createId({ prefix: "_" })).toThrow(GenerateError);
    // Empty string fails regex check (requires 1-12 chars)
    expect(() => createId({ prefix: "" })).toThrow(GenerateError);
  });

  it("throws on invalid prefix charset", () => {
    expect(() => createId({ prefix: "User-ID" })).toThrow(GenerateError);
    expect(() => createId({ prefix: "user_id" })).toThrow(GenerateError);
  });

  it("throws on prefix too long", () => {
    expect(() => createId({ prefix: "user-account-production-v2" })).toThrow(GenerateError);
  });

  it("generates batch IDs when count > 1", () => {
    const ids = createId({ strategy: "uuidv4", count: 5 });
    expect(Array.isArray(ids)).toBe(true);
    expect((ids as string[]).length).toBe(5);
    for (const id of ids as string[]) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  it("generates unique IDs (no duplicates in 1000)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = createId({ strategy: "uuidv4" }) as string;
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
  });

  it("generates time-ordered IDs that sort lexicographically", () => {
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      ids.push(createId({ strategy: "time" }) as string);
    }
    // Each subsequent ID should be lexicographically >= the previous
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]! >= ids[i - 1]!).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// configure — unit tests
// ---------------------------------------------------------------------------

describe("configure", () => {
  beforeEach(() => {
    _resetConfig();
  });

  it("sets default strategy", () => {
    configure({ defaultStrategy: "uuidv4" });
    expect(_getConfig().defaultStrategy).toBe("uuidv4");
  });

  it("merges with existing config", () => {
    configure({ defaultStrategy: "time" });
    configure({ prefixes: { user: "usr" } });
    const cfg = _getConfig();
    expect(cfg.defaultStrategy).toBe("time");
    expect(cfg.prefixes?.user).toBe("usr");
  });

  it("applies defaultStrategy to createId()", () => {
    configure({ defaultStrategy: "uuidv4" });
    const id = createId() as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

// ---------------------------------------------------------------------------
// parseId — unit tests
// ---------------------------------------------------------------------------

describe("parseId", () => {
  it("recognises legacy UUID v4", () => {
    const result = parseId("550e8400-e29b-41d4-a716-446655440000");
    expect(result.legacy).toBe(true);
    expect(result.strategy).toBe("uuidv4");
    expect(result.prefix).toBeUndefined();
    expect(result.schemaVersion).toBeUndefined();
  });

  it("recognises legacy UUID v7 with timestamp", () => {
    const result = parseId("018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b");
    expect(result.legacy).toBe(true);
    expect(result.strategy).toBe("time");
    expect(result.timestampMs).toBe(BigInt(0x018f_3c1a_7b2d));
  });

  it("parses native ID with prefix", () => {
    const id = createId({ prefix: "usr", strategy: "uuidv4" }) as string;
    const result = parseId(id);
    expect(result.legacy).toBe(false);
    expect(result.prefix).toBe("usr");
    expect(result.strategy).toBe("uuidv4");
    expect(result.schemaVersion).toBe(1);
  });

  it("parses native time-ordered ID with timestamp", () => {
    const id = createId({ prefix: "ord", strategy: "time" }) as string;
    const result = parseId(id);
    expect(result.legacy).toBe(false);
    expect(result.prefix).toBe("ord");
    expect(result.strategy).toBe("time");
    expect(result.timestampMs).toBeDefined();
  });

  it("rejects invalid format", () => {
    expect(() => parseId("not-an-id")).toThrow(ParseError);
  });

  it("rejects garbage input", () => {
    expect(() => parseId("")).toThrow(ParseError);
    expect(() => parseId("abc123")).toThrow(ParseError);
  });

  it("extracts entropy hex", () => {
    const result = parseId("550e8400-e29b-41d4-a716-446655440000");
    expect(result.entropy).toBe("550e8400e29b41d4a716446655440000");
  });
});

// ---------------------------------------------------------------------------
// isLegacyId — unit tests
// ---------------------------------------------------------------------------

describe("isLegacyId", () => {
  it("returns true for UUID v4", () => {
    expect(isLegacyId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("returns true for UUID v7", () => {
    expect(isLegacyId("018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b")).toBe(true);
  });

  it("returns false for native IDs", () => {
    const id = createId({ prefix: "usr", strategy: "uuidv4" }) as string;
    expect(isLegacyId(id)).toBe(false);
  });

  it("returns false for garbage input", () => {
    expect(isLegacyId("definitely-not-an-id")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// withIdContext — unit tests
// ---------------------------------------------------------------------------

describe("withIdContext", () => {
  it("executes the function and returns its value", () => {
    const result = withIdContext({ requestId: "abc" }, () => 42);
    expect(result).toBe(42);
  });

  it("passes through context in Phase 2", () => {
    // Phase 2: pass-through only
    let called = false;
    withIdContext({ requestId: "test" }, () => {
      called = true;
    });
    expect(called).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Errors — unit tests
// ---------------------------------------------------------------------------

describe("Errors", () => {
  it("GenerateError has code and strategy", () => {
    const err = new GenerateError("test", "uuidv4", { detail: "value" });
    expect(err.code).toBe("GENERATE_ERROR");
    expect(err.strategy).toBe("uuidv4");
    expect(err.details).toEqual({ detail: "value" });
    expect(err).toBeInstanceOf(BetterUuidError);
  });

  it("ParseError has position and snippet", () => {
    const err = new ParseError("bad format", 5, "abc123");
    expect(err.code).toBe("PARSE_ERROR");
    expect(err.position).toBe(5);
    expect(err.snippet).toBe("abc123");
    expect(err).toBeInstanceOf(BetterUuidError);
  });

  it("BetterUuidError base works", () => {
    const err = new BetterUuidError("CUSTOM", "message");
    expect(err.code).toBe("CUSTOM");
    expect(err.message).toBe("message");
    expect(err.name).toBe("BetterUuidError");
  });
});

// ---------------------------------------------------------------------------
// E2E — generate → parse roundtrip
// ---------------------------------------------------------------------------

describe("E2E roundtrip", () => {
  it("uuidv4: generate → parse → verify", () => {
    const id = createId({ strategy: "uuidv4" }) as string;
    const parsed = parseId(id);
    // Without prefix, JS engine returns plain UUID string → correctly detected as legacy
    expect(parsed.legacy).toBe(true);
    expect(parsed.strategy).toBe("uuidv4");
    expect(parsed.entropy.length).toBe(32); // 16 bytes hex
  });

  it("uuidv4 with prefix: generate → parse → verify", () => {
    const id = createId({ prefix: "txn", strategy: "uuidv4" }) as string;
    const parsed = parseId(id);
    expect(parsed.legacy).toBe(false);
    expect(parsed.prefix).toBe("txn");
    expect(parsed.strategy).toBe("uuidv4");
  });

  it("time: generate → parse → verify timestamp", () => {
    const before = Date.now();
    const id = createId({ strategy: "time" }) as string;
    const after = Date.now();
    const parsed = parseId(id);
    // Without prefix, JS engine returns plain UUID v7 string → detected as legacy
    expect(parsed.legacy).toBe(true);
    expect(parsed.strategy).toBe("time");
    const ts = Number(parsed.timestampMs!);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("time with prefix: generate → parse → verify", () => {
    const id = createId({ prefix: "evt", strategy: "time" }) as string;
    const parsed = parseId(id);
    expect(parsed.legacy).toBe(false);
    expect(parsed.prefix).toBe("evt");
    expect(parsed.strategy).toBe("time");
  });

  it("safe mode: generate → parse as legacy", () => {
    const id = createId({ mode: "safe" }) as string;
    const parsed = parseId(id);
    // Safe mode produces UUID v4 which is recognized as native (no prefix = legacy path in JS engine)
    // Actually, the JS engine parses it as legacy since there's no prefix separator
    expect(parsed.legacy).toBe(true);
    expect(parsed.strategy).toBe("uuidv4");
  });

  it("batch generate → all parseable", () => {
    const ids = createId({ strategy: "uuidv4", count: 100 }) as string[];
    expect(ids.length).toBe(100);
    for (const id of ids) {
      const parsed = parseId(id);
      expect(parsed.strategy).toBe("uuidv4");
    }
  });
});

// ---------------------------------------------------------------------------
// WASM status
// ---------------------------------------------------------------------------

describe("WASM status", () => {
  it("isWasm returns boolean", () => {
    expect(typeof isWasm()).toBe("boolean");
  });

  it("init resolves", async () => {
    await expect(init()).resolves.not.toThrow();
  });
});
