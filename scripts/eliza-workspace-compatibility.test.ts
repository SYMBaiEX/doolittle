import { describe, expect, it } from "vitest";
import {
  ELIZA_WORKSPACE_COMPATIBILITY,
  normalizeCompatibilityPackagePath,
} from "./eliza-workspace-compatibility";

describe("Eliza workspace compatibility paths", () => {
  it("normalizes Windows paths to the registry's portable form", () => {
    expect(
      normalizeCompatibilityPackagePath(
        "packages\\plugin-worker-runtime\\package.json",
      ),
    ).toBe("packages/plugin-worker-runtime/package.json");
  });

  it("keeps every compatibility registry path normalized", () => {
    for (const entry of ELIZA_WORKSPACE_COMPATIBILITY) {
      expect(normalizeCompatibilityPackagePath(entry.packagePath)).toBe(
        entry.packagePath,
      );
    }
  });
});
