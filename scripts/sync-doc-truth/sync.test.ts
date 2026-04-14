import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { runSyncDocTruth } from "./sync";

const repoRoot = resolve(import.meta.dir, "..", "..");

describe("runSyncDocTruth", () => {
  it("keeps generated docs and plugin readmes synchronized in check mode", () => {
    expect(runSyncDocTruth({ root: repoRoot, mode: "check" })).toEqual([]);
  });
});
