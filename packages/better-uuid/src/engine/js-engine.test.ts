import { describe, it, expect, beforeEach } from "vitest";
import { createJsEngine, type JsEngine } from "./js-engine";

describe("JS Engine — unit tests", () => {
  let engine: JsEngine;

  beforeEach(() => {
    engine = createJsEngine();
  });

  // ---------------------------------------------------------------------------
  // generate — V4
  // ---------------------------------------------------------------------------

  describe("generate uuidv4", () => {
    it("produces valid UUID v4 format", () => {
      const id = engine.generate({ strategy: "uuidv4" }) as string;
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("produces unique IDs (1000 iterations)", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const id = engine.generate({ strategy: "uuidv4" }) as string;
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    });

    it("prepends prefix", () => {
      const id = engine.generate({ strategy: "uuidv4", prefix: "usr" }) as string;
      expect(id.startsWith("usr_")).toBe(true);
    });

    it("generates batch", () => {
      const ids = engine.generate({ strategy: "uuidv4", count: 10 }) as string[];
      expect(ids.length).toBe(10);
      for (const id of ids) {
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // generate — V7
  // ---------------------------------------------------------------------------

  describe("generate v7", () => {
    it("produces valid UUID v7 format", () => {
      const id = engine.generate({ strategy: "time" }) as string;
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("produces lexicographically sortable IDs", () => {
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        ids.push(engine.generate({ strategy: "time" }) as string);
      }
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]! >= ids[i - 1]!).toBe(true);
      }
    });

    it("prepends prefix", () => {
      const id = engine.generate({ strategy: "time", prefix: "ord" }) as string;
      expect(id.startsWith("ord_")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // generate — safe mode
  // ---------------------------------------------------------------------------

  describe("generate safe mode", () => {
    it("produces UUID v4 shape without prefix", () => {
      const id = engine.generate({ mode: "safe" }) as string;
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("ignores prefix in safe mode", () => {
      const id = engine.generate({ mode: "safe", prefix: "usr" }) as string;
      expect(id).not.toContain("_");
    });
  });

  // ---------------------------------------------------------------------------
  // generate — errors
  // ---------------------------------------------------------------------------

  describe("generate errors", () => {
    it("throws on unsupported strategy", () => {
      expect(() => engine.generate({ strategy: "snowflake" })).toThrow("Unsupported strategy");
    });
  });

  // ---------------------------------------------------------------------------
  // parse — legacy
  // ---------------------------------------------------------------------------

  describe("parse legacy UUIDs", () => {
    it("parses UUID v4", () => {
      const result = engine.parse("550e8400-e29b-41d4-a716-446655440000");
      expect(result.legacy).toBe(true);
      expect(result.strategy).toBe("uuidv4");
      expect(result.prefix).toBeUndefined();
      expect(result.schemaVersion).toBeUndefined();
      expect(result.entropy).toBe("550e8400e29b41d4a716446655440000");
    });

    it("parses UUID v7 with timestamp", () => {
      const result = engine.parse("018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b");
      expect(result.legacy).toBe(true);
      expect(result.strategy).toBe("time");
      expect(result.timestampMs).toBe(BigInt(0x018f_3c1a_7b2d));
    });

    it("rejects invalid UUID", () => {
      expect(() => engine.parse("not-a-uuid")).toThrow("Invalid format");
    });
  });

  // ---------------------------------------------------------------------------
  // parse — native
  // ---------------------------------------------------------------------------

  describe("parse native IDs", () => {
    it("parses native uuidv4 with prefix", () => {
      const result = engine.parse("usr_550e8400-e29b-41d4-a716-446655440000");
      expect(result.legacy).toBe(false);
      expect(result.prefix).toBe("usr");
      expect(result.strategy).toBe("uuidv4");
      expect(result.schemaVersion).toBe(1);
    });

    it("parses native v7 with prefix and timestamp", () => {
      const result = engine.parse("ord_018f3c1a-7b2d-7e3f-a4b5-c6d7e8f90a1b");
      expect(result.legacy).toBe(false);
      expect(result.prefix).toBe("ord");
      expect(result.strategy).toBe("time");
      expect(result.timestampMs).toBe(BigInt(0x018f_3c1a_7b2d));
    });

    it("rejects invalid prefix", () => {
      expect(() => engine.parse("INVALID_550e8400-e29b-41d4-a716-446655440000")).toThrow("Invalid prefix");
    });

    it("rejects malformed body", () => {
      expect(() => engine.parse("usr_not-a-uuid")).toThrow("Invalid format");
    });
  });

  // ---------------------------------------------------------------------------
  // isLegacy
  // ---------------------------------------------------------------------------

  describe("isLegacy", () => {
    it("returns true for legacy UUID v4", () => {
      expect(engine.isLegacy("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    });

    it("returns false for native ID", () => {
      expect(engine.isLegacy("usr_550e8400-e29b-41d4-a716-446655440000")).toBe(false);
    });

    it("returns false for garbage", () => {
      expect(engine.isLegacy("definitely-not-an-id")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // schemaVersion / isWasm
  // ---------------------------------------------------------------------------

  describe("metadata", () => {
    it("schemaVersion returns 1", () => {
      expect(engine.schemaVersion()).toBe(1);
    });

    it("isWasm returns false (JS engine)", () => {
      expect(engine.isWasm()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // E2E roundtrip
  // ---------------------------------------------------------------------------

  describe("E2E roundtrip", () => {
    it("uuidv4: generate → parse → verify", () => {
      const id = engine.generate({ strategy: "uuidv4" }) as string;
      const parsed = engine.parse(id);
      expect(parsed.strategy).toBe("uuidv4");
      expect(parsed.entropy.length).toBe(32);
    });

    it("v7: generate → parse → verify timestamp is recent", () => {
      const before = Date.now() - 1000;
      const id = engine.generate({ strategy: "time" }) as string;
      const after = Date.now() + 1000;
      const parsed = engine.parse(id);
      expect(parsed.strategy).toBe("time");
      const ts = Number(parsed.timestampMs!);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it("with prefix: generate → parse → verify prefix", () => {
      const id = engine.generate({ strategy: "uuidv4", prefix: "txn" }) as string;
      const parsed = engine.parse(id);
      expect(parsed.prefix).toBe("txn");
      expect(parsed.strategy).toBe("uuidv4");
    });
  });
});
