import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runSyncDocTruth, validateMarkdownLinks } from "./sync";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("runSyncDocTruth", () => {
  it("keeps generated docs and plugin readmes synchronized in check mode", () => {
    expect(runSyncDocTruth({ root: repoRoot, mode: "check" })).toEqual([]);
  });

  it("checks repository-local Markdown targets and heading fragments", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-doc-links-"));
    try {
      writeFileSync(
        join(root, "README.md"),
        [
          "[good](./docs.md#Working-notes)",
          "[external](https://example.com/missing)",
          "[anchor](#local)",
          "[missing](./missing.md)",
          "[bad fragment](./docs.md#missing)",
        ].join("\n"),
      );
      writeFileSync(join(root, "docs.md"), "# Working notes\n");

      expect(validateMarkdownLinks(root, ["README.md"])).toEqual([
        "README.md:4: missing link target: ./missing.md",
        "README.md:5: missing link fragment: ./docs.md#missing",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps active architecture and onboarding docs in the checked target set", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-doc-links-active-"));
    try {
      for (const path of ["docs/monorepo.md", "docs/quickstart.md"]) {
        const target = join(root, path);
        mkdirSync(join(target, ".."), { recursive: true });
        writeFileSync(target, "[missing](./absent.md)\n");
      }

      expect(validateMarkdownLinks(root)).toEqual([
        "README.md: file does not exist",
        "docs/eliza-maximization-matrix.md: file does not exist",
        "docs/monorepo.md:1: missing link target: ./absent.md",
        "docs/quickstart.md:1: missing link target: ./absent.md",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
