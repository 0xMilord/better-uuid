import { describe, it, expect } from "vitest";
import { nanoid, customAlphabet } from "../compat/nanoid";

describe("compat/nanoid", () => {
  it("nanoid() returns 21-char URL-safe string by default", () => {
    const id = nanoid();
    expect(id.length).toBe(21);
    expect(id).toMatch(/^[A-Za-z0-9_-]{21}$/);
  });

  it("nanoid(size) returns correct length", () => {
    expect(nanoid(10).length).toBe(10);
    expect(nanoid(32).length).toBe(32);
  });

  it("nanoid() generates unique values", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(nanoid());
    }
    expect(ids.size).toBe(1000);
  });

  it("customAlphabet uses provided alphabet", () => {
    const gen = customAlphabet("abc", 10);
    const id = gen();
    expect(id.length).toBe(10);
    expect(id).toMatch(/^[abc]{10}$/);
  });
});
