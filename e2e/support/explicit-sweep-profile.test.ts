import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertExplicitSweepProfileUnlocked } from "./explicit-sweep-profile";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-explicit-profile-"));
  roots.push(root);
  mkdirSync(join(root, "runtime", "pglite"), { recursive: true });
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("explicit sweep profiles", () => {
  it("permits an isolated lock-free profile", () => {
    expect(() => assertExplicitSweepProfileUnlocked(fixture())).not.toThrow();
  });
  it.each(["eliza-pglite.lock", "postmaster.pid"])(
    "rejects %s and leaves its bytes intact",
    (file) => {
      const root = fixture();
      const lock = join(root, "runtime", "pglite", file);
      writeFileSync(lock, "owned-by-another-runtime\n");
      expect(() => assertExplicitSweepProfileUnlocked(root)).toThrow(
        "inactive clones",
      );
      expect(readFileSync(lock, "utf8")).toBe("owned-by-another-runtime\n");
      // Removing only our fixture-owned lock permits the prepared clone to run.
      rmSync(lock);
      expect(() => assertExplicitSweepProfileUnlocked(root)).not.toThrow();
    },
  );
  it("does not ignore or follow a dangling lock symlink", () => {
    const root = fixture();
    const target = join(root, "missing-target");
    const lock = join(root, "runtime", "pglite", "eliza-pglite.lock");
    symlinkSync(target, lock);
    expect(() => assertExplicitSweepProfileUnlocked(root)).toThrow(
      "will not remove",
    );
  });
});
