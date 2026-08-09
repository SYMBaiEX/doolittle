import { describe, expect, it } from "vitest";
import { statusTone } from "./detail-primitives";
import { CODEGEN_MODES, runArtifacts } from "./orchestration-runs-model";

describe("orchestration runs presentation model", () => {
  it("keeps the launcher modes in their public order", () => {
    expect(CODEGEN_MODES.map((mode) => mode.id)).toEqual([
      "generate",
      "research",
      "prd",
      "qa",
    ]);
    expect(CODEGEN_MODES.map((mode) => mode.label)).toEqual([
      "Generate",
      "Research",
      "PRD",
      "QA",
    ]);
  });

  it("prefers opaque artifacts and falls back to recorded paths", () => {
    expect(
      runArtifacts({ id: "run-1", artifacts: [{ path: "receipt.json" }] }),
    ).toEqual([{ path: "receipt.json" }]);
    expect(
      runArtifacts({ id: "run-2", artifacts: [], artifactPaths: ["out.txt"] }),
    ).toEqual(["out.txt"]);
  });

  it.each([
    ["completed", "good"],
    ["cancelled", "bad"],
    ["running", "warn"],
    ["unknown", "neutral"],
  ] as const)("maps %s to the stable badge tone", (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });
});
