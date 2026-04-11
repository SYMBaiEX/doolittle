import { describe, expect, test } from "bun:test";
import { editDistance, fuzzyMatch, normaliseLine } from "./matching";

describe("fuzzy patch matching", () => {
  test("computes edit distance", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
  });

  test("normalises whitespace for comparison", () => {
    expect(normaliseLine("hello   world  ")).toBe("hello world");
  });

  test("matches nearby lines after normalisation", () => {
    expect(fuzzyMatch("hello   world", "hello world", 0)).toBe(true);
    expect(fuzzyMatch("hello world", "hello there", 2)).toBe(false);
  });
});
