import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runSyncDocTruth } from "./sync";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("runSyncDocTruth", () => {
  it("keeps generated docs and plugin readmes synchronized in check mode", () => {
    expect(runSyncDocTruth({ root: repoRoot, mode: "check" })).toEqual([]);
  });
});
