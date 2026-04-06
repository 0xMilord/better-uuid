import { describe, it, expect, beforeEach } from "vitest";
import { createId, parseId, isLegacyId, configure, _resetConfig, _getConfig, withIdContext } from "./index";

describe("createId", () => {
  beforeEach(() => {
    _resetConfig();
  });

  it("returns a string", () => {
    const id = createId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("uses strategy tag in output", () => {
    const id = createId({ strategy: "time" });
    expect(id).toMatch(/^\[time\]/);
  });

  it("respects prefix option", () => {
    const id = createId({ prefix: "usr", strategy: "time" });
    expect(id).toContain("usr_");
  });

  it("safe mode returns UUID-shaped output", () => {
    const id = createId({ mode: "safe" });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

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
    configure({ strict: true });
    const cfg = _getConfig();
    expect(cfg.defaultStrategy).toBe("time");
    expect(cfg.strict).toBe(true);
  });
});

describe("parseId", () => {
  it("recognises legacy UUID v4", () => {
    const result = parseId("550e8400-e29b-41d4-a716-446655440000");
    expect(result.legacy).toBe(true);
    expect(result.strategy).toBe("uuidv4");
    expect(result.prefix).toBeUndefined();
  });

  it("recognises legacy UUID v7", () => {
    const result = parseId("018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b");
    expect(result.legacy).toBe(true);
    expect(result.strategy).toBe("time");
  });

  it("rejects invalid format", () => {
    expect(() => parseId("not-an-id")).toThrow("Invalid format");
  });

  it("parses native better-uuid placeholder format", () => {
    const id = createId({ prefix: "usr", strategy: "time" }) as string;
    const result = parseId(id);
    expect(result.legacy).toBe(false);
    expect(result.strategy).toBe("time");
    expect(result.prefix).toBe("usr");
  });
});

describe("isLegacyId", () => {
  it("returns true for UUID v4", () => {
    expect(isLegacyId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("returns false for native IDs", () => {
    const id = createId({ strategy: "time" }) as string;
    expect(isLegacyId(id)).toBe(false);
  });

  it("returns false for garbage input", () => {
    expect(isLegacyId("definitely-not-an-id")).toBe(false);
  });
});

describe("withIdContext", () => {
  it("executes the function and returns its value", () => {
    const result = withIdContext({ requestId: "abc" }, () => 42);
    expect(result).toBe(42);
  });
});
