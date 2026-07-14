// src/lib/characters/speech/hashText.test.ts
//
// Run with: bun test

import { describe, expect, it } from "bun:test";
import { hashText } from "./hashText";

describe("hashText", () => {
  it("is deterministic — same input always produces the same hash", () => {
    expect(hashText("hello")).toBe(hashText("hello"));
  });

  it("produces different hashes for different input", () => {
    expect(hashText("hello")).not.toBe(hashText("world"));
  });

  it("produces an 8-character lowercase hex string", () => {
    expect(/^[0-9a-f]{8}$/.test(hashText("some response line"))).toBe(true);
  });

  it("handles an empty string without throwing", () => {
    expect(() => hashText("")).not.toThrow();
  });
});
