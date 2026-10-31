import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  seedLiveCodingProject,
  verifyLiveCodingProject,
} from "../support/live-coding";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-self-hosting-contract-"));
  roots.push(root);
  seedLiveCodingProject(root);
  return root;
}
it("rejects the seeded regression and independently accepts the actual Doolittle implementation", () => {
  const root = fixture();
  expect(() => verifyLiveCodingProject(root)).toThrow();
  const target = "packages/agent/src/utils/workspace-commands.ts";
  cpSync(resolve(target), join(root, target));
  expect(verifyLiveCodingProject(root)).toMatchObject({
    task: "doolittle-nub-self-hosting-v1",
    parentTestExit: 0,
    dependenciesUnchanged: true,
  });
});
it("refuses verifier tampering before accepting any claimed coding result", () => {
  const root = fixture();
  writeFileSync(
    join(root, "tests/nub-workspace.test.mjs"),
    "// suppressed tests\n",
  );
  expect(() => verifyLiveCodingProject(root)).toThrow(
    "protected self-hosting fixture",
  );
});
