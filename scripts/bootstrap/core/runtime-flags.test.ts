import { describe, expect, it } from "bun:test";
import {
  resolveMaxIterations,
  resolveRunDepth,
  resolveToolProgressMode,
} from "./runtime-flags";

describe("runtime flag helpers", () => {
  it("normalizes supported run depths and falls back safely", () => {
    expect(resolveRunDepth("deep")).toBe("deep");
    expect(resolveRunDepth("mystery")).toBe("standard");
    expect(resolveRunDepth(undefined)).toBe("standard");
  });

  it("normalizes supported progress modes and falls back safely", () => {
    expect(resolveToolProgressMode("verbose")).toBe("verbose");
    expect(resolveToolProgressMode("mystery")).toBe("new");
    expect(resolveToolProgressMode(undefined)).toBe("new");
  });

  it("prefers explicit max iterations before run-depth presets", () => {
    expect(
      resolveMaxIterations(
        new Map([
          ["DOOLITTLE_MAX_ITERATIONS", "42"],
          ["DOOLITTLE_RUN_DEPTH", "quick"],
        ]),
      ),
    ).toBe(42);
  });

  it("derives max iterations from the run-depth preset when unset", () => {
    expect(
      resolveMaxIterations(new Map([["DOOLITTLE_RUN_DEPTH", "explore"]])),
    ).toBeGreaterThan(0);
    expect(resolveMaxIterations(new Map())).toBeGreaterThan(0);
  });
});
