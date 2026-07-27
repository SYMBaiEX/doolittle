import { describe, expect, it } from "bun:test";
import {
  canRecallSavedProfileMatches,
  freezeMemoryMatchSnapshot,
  normalizeSavedProfileMatches,
} from "./memory-matches";

describe("saved profile memory matches", () => {
  it("bounds, sanitizes, and deduplicates recalled values", () => {
    const matches = normalizeSavedProfileMatches({
      hits: [
        { kind: "goal", value: "Ship a reliable desktop app" },
        { kind: "goal", value: "ship a reliable desktop app" },
        { kind: "\u0000", value: "\u0000Keep local data local\n" },
        { kind: "fact", value: "x".repeat(220) },
        { value: "" },
      ],
    });

    expect(matches).toEqual([
      { kind: "goal", value: "Ship a reliable desktop app" },
      { kind: "saved detail", value: "Keep local data local" },
      { kind: "fact", value: `${"x".repeat(159)}…` },
    ]);
  });

  it("only freezes a result that was recalled for the submitted draft", () => {
    const matches = [{ kind: "goal", value: "Ship it" }];
    expect(canRecallSavedProfileMatches("ship")).toBe(true);
    expect(canRecallSavedProfileMatches("hey")).toBe(false);
    expect(
      freezeMemoryMatchSnapshot("ship it", {
        query: "ship it",
        matches,
        status: "ready",
      }),
    ).toEqual({ count: 1, source: "saved-profile-recall" });
    expect(
      freezeMemoryMatchSnapshot("ship it now", {
        query: "ship it",
        matches,
        status: "ready",
      }),
    ).toBe(undefined);
    expect(
      freezeMemoryMatchSnapshot("ship it", {
        query: "ship it",
        matches,
        status: "loading",
      }),
    ).toBe(undefined);
  });
});
