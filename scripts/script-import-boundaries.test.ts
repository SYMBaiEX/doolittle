import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listGitTrackedFiles } from "./git-tracked-files";

const DEPTH_COUPLED_AGENT_IMPORT =
  /from\s+["'](?:\.\.\/)+packages\/agent\/src\//u;

describe("root script import boundaries", () => {
  it("uses the configured agent source alias instead of path-depth coupling", () => {
    const failures = listGitTrackedFiles()
      .filter((path) => /^scripts\/.+\.[cm]?tsx?$/u.test(path))
      .filter((path) => existsSync(path))
      .filter((path) =>
        DEPTH_COUPLED_AGENT_IMPORT.test(readFileSync(path, "utf8")),
      );

    expect(failures).toEqual([]);
  });
});
