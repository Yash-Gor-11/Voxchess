// src/lib/voice/commands/CommandParser.test.ts
//
// Run with: bun test
//
// Every case here was verified against real Normalizer output before
// being written — the "take back" case specifically caught a real bug
// (Normalizer's generic CAPTURE_ALIASES silently turns "take" into
// "takes" for any token, including inside command phrases) during
// development. See CommandParser.ts's UNDO_PHRASES comment.

import { describe, expect, it } from "bun:test";
import { parseCommand, isDangerousCommand, DANGEROUS_COMMAND_TYPES } from "./CommandParser";
import { normalize } from "../intent/Normalizer";

function cmd(phrase: string) {
  return parseCommand(normalize(phrase));
}

describe("parseCommand — undo", () => {
  it('recognizes "undo"', () => {
    expect(cmd("undo")).toEqual({ type: "undo" });
  });

  it('recognizes "take back" despite Normalizer canonicalizing "take" -> "takes"', () => {
    // Regression test for a real bug found during development: this
    // phrase's raw form never actually reaches parseCommand, since
    // Normalizer's CAPTURE_ALIASES turns "take" into "takes" generically.
    expect(cmd("take back")).toEqual({ type: "undo" });
  });

  it('recognizes "takeback" (single word)', () => {
    expect(cmd("takeback")).toEqual({ type: "undo" });
  });

  it("strips filler words before matching", () => {
    expect(cmd("um undo please")).toEqual({ type: "undo" });
  });
});

describe("parseCommand — resign", () => {
  it('recognizes "resign"', () => {
    expect(cmd("resign")).toEqual({ type: "resign" });
  });

  it('recognizes "resign the game" despite "the" being filler-stripped', () => {
    expect(cmd("resign the game")).toEqual({ type: "resign" });
  });
});

describe("parseCommand — offer-draw", () => {
  it('recognizes a bare "draw"', () => {
    expect(cmd("draw")).toEqual({ type: "offer-draw" });
  });

  it('recognizes "offer a draw" (the "a" survives normalization by design)', () => {
    expect(cmd("offer a draw")).toEqual({ type: "offer-draw" });
  });
});

describe("parseCommand — flip-board", () => {
  it('recognizes "flip"', () => {
    expect(cmd("flip")).toEqual({ type: "flip-board" });
  });

  it('recognizes "flip the board" despite "the" being filler-stripped', () => {
    expect(cmd("flip the board")).toEqual({ type: "flip-board" });
  });
});

describe("parseCommand — negative cases", () => {
  it("returns null for a chess move phrase", () => {
    expect(cmd("knight f3")).toBeNull();
  });

  it("returns null for unrecognized gibberish", () => {
    expect(cmd("gibberish")).toBeNull();
  });

  it("returns null for an empty token array", () => {
    expect(parseCommand([])).toBeNull();
  });
});

describe("isDangerousCommand", () => {
  it("resign and offer-draw are dangerous", () => {
    expect(isDangerousCommand({ type: "resign" })).toBe(true);
    expect(isDangerousCommand({ type: "offer-draw" })).toBe(true);
  });

  it("undo and flip-board are not dangerous", () => {
    expect(isDangerousCommand({ type: "undo" })).toBe(false);
    expect(isDangerousCommand({ type: "flip-board" })).toBe(false);
  });

  it("DANGEROUS_COMMAND_TYPES contains exactly resign and offer-draw", () => {
    expect([...DANGEROUS_COMMAND_TYPES].sort()).toEqual(["offer-draw", "resign"]);
  });
});
