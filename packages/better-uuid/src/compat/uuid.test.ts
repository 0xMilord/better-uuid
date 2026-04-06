import { describe, it, expect } from "vitest";
import { v4, v7, validate, NIL } from "../compat/uuid";

describe("compat/uuid", () => {
  it("v4 returns UUID-shaped string", () => {
    const id = v4();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("v7 returns UUID-shaped string (v4 placeholder in Phase 0)", () => {
    // Phase 0: v7 not yet implemented; delegates to crypto.randomUUID() (v4)
    // Phase 1: will implement true UUID v7 generation
    const id = v7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("validate returns true for valid UUIDs", () => {
    expect(validate("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("validate returns false for invalid strings", () => {
    expect(validate("not-a-uuid")).toBe(false);
  });

  it("NIL is the zero UUID", () => {
    expect(NIL).toBe("00000000-0000-0000-0000-000000000000");
  });
});
