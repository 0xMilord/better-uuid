import { describe, it, expect } from "vitest";
import { parseId, createId, isLegacyId } from "./index.js";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

// ---------------------------------------------------------------------------
// Integration: Contract test against Rust golden fixtures
//
// These tests verify that the TypeScript parse output matches what Rust
// generated, ensuring cross-language consistency.
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(__dirname, "../../../fixtures");

function loadFixtures(): Array<{
  strategy: string;
  prefix: string | null;
  id: string;
  parsed: {
    legacy: boolean;
    prefix: string | null;
    strategy: string;
    schema_version: number | null;
    timestamp_ms: number | null;
    entropy_hex: string;
  };
}> {
  const content = readFileSync(join(FIXTURES_DIR, "vectors.jsonl"), "utf-8");
  return content
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function loadLegacyFixtures(): Array<{
  id: string;
  parsed: {
    legacy: boolean;
    strategy: string;
    timestamp_ms: number | null;
    entropy_hex: string;
  };
}> {
  const content = readFileSync(join(FIXTURES_DIR, "legacy.jsonl"), "utf-8");
  return content
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("Integration — Rust fixture contract tests", () => {
  const fixtures = loadFixtures();
  const legacyFixtures = loadLegacyFixtures();

  // ---------------------------------------------------------------------------
  // Parse contract: every fixture ID must parse correctly
  // ---------------------------------------------------------------------------

  describe("parse fixtures", () => {
    it("parses all vector fixtures without error", () => {
      for (const fixture of fixtures) {
        const result = parseId(fixture.id);
        expect(result).toBeDefined();
      }
    });

    it("parses all legacy fixtures without error", () => {
      for (const fixture of legacyFixtures) {
        const result = parseId(fixture.id);
        expect(result).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Entropy contract: parsed entropy hex matches fixture
  // ---------------------------------------------------------------------------

  describe("entropy contract", () => {
    it("vector fixture entropy matches", () => {
      // Test a subset for performance
      const sample = fixtures.slice(0, 100);
      for (const fixture of sample) {
        const result = parseId(fixture.id);
        expect(result.entropy.toLowerCase()).toBe(fixture.parsed.entropy_hex.toLowerCase());
      }
    });

    it("legacy fixture entropy matches", () => {
      for (const fixture of legacyFixtures) {
        const result = parseId(fixture.id);
        expect(result.entropy.toLowerCase()).toBe(fixture.parsed.entropy_hex.toLowerCase());
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Legacy detection contract
  // ---------------------------------------------------------------------------

  describe("legacy detection", () => {
    it("vector fixtures without prefix are detected as legacy", () => {
      const noPrefix = fixtures.filter((f) => f.prefix == null);
      for (const fixture of noPrefix.slice(0, 50)) {
        const result = parseId(fixture.id);
        expect(result.legacy).toBe(true);
      }
    });

    it("vector fixtures with prefix are NOT legacy", () => {
      const withPrefix = fixtures.filter((f) => f.prefix != null);
      for (const fixture of withPrefix.slice(0, 50)) {
        const result = parseId(fixture.id);
        expect(result.legacy).toBe(false);
      }
    });

    it("all legacy fixtures are detected as legacy", () => {
      for (const fixture of legacyFixtures) {
        expect(isLegacyId(fixture.id)).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Strategy detection contract
  // ---------------------------------------------------------------------------

  describe("strategy detection", () => {
    it("uuidv4 fixtures detected as uuidv4", () => {
      const v4Fixtures = fixtures.filter((f) => f.strategy === "uuidv4" && f.prefix == null);
      for (const fixture of v4Fixtures.slice(0, 50)) {
        const result = parseId(fixture.id);
        expect(result.strategy).toBe("uuidv4");
      }
    });

    it("time fixtures detected as time", () => {
      const v7Fixtures = fixtures.filter((f) => f.strategy === "time" && f.prefix == null);
      for (const fixture of v7Fixtures.slice(0, 50)) {
        const result = parseId(fixture.id);
        expect(result.strategy).toBe("time");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Timestamp extraction contract (UUID v7)
  // ---------------------------------------------------------------------------

  describe("timestamp extraction", () => {
    it("v7 fixtures have reasonable timestamps", () => {
      const v7Fixtures = fixtures.filter(
        (f) => f.strategy === "time" && f.parsed.timestamp_ms != null,
      );
      for (const fixture of v7Fixtures.slice(0, 50)) {
        const result = parseId(fixture.id);
        expect(result.timestampMs).toBe(BigInt(fixture.parsed.timestamp_ms!));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Generate → parse roundtrip on generated IDs
  // ---------------------------------------------------------------------------

  describe("generate → parse roundtrip", () => {
    it("uuidv4 roundtrip matches fixture structure", () => {
      const id = createId({ strategy: "uuidv4" }) as string;
      const parsed = parseId(id);
      expect(parsed.strategy).toBe("uuidv4");
      expect(parsed.entropy.length).toBe(32);
      // Without prefix, JS engine treats it as legacy since no underscore
      expect(parsed.legacy).toBe(true);
    });

    it("uuidv4 with prefix roundtrip", () => {
      const id = createId({ strategy: "uuidv4", prefix: "usr" }) as string;
      const parsed = parseId(id);
      expect(parsed.legacy).toBe(false);
      expect(parsed.prefix).toBe("usr");
      expect(parsed.strategy).toBe("uuidv4");
    });

    it("time with prefix roundtrip", () => {
      const id = createId({ strategy: "time", prefix: "ord" }) as string;
      const parsed = parseId(id);
      expect(parsed.legacy).toBe(false);
      expect(parsed.prefix).toBe("ord");
      expect(parsed.strategy).toBe("time");
      expect(parsed.timestampMs).toBeDefined();
    });
  });
});
