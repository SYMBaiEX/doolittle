import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  runSyncDocTruth,
  validateMarkdownLinks,
  writeGeneratedDocFile,
} from "./sync";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("runSyncDocTruth", () => {
  it.skipIf(process.platform === "win32")(
    "rejects a FIFO document without waiting for a writer",
    () => {
      const root = mkdtempSync(join(tmpdir(), "doolittle-doc-fifo-"));
      try {
        expect(spawnSync("mkfifo", [join(root, "README.md")]).status).toBe(0);
        const child = spawnSync(
          "nub",
          [
            "-e",
            "import { validateMarkdownLinks } from './scripts/sync-doc-truth/sync.ts'; try { validateMarkdownLinks(process.argv[1], ['README.md']); process.exit(2); } catch { process.exit(0); }",
            root,
          ],
          { cwd: repoRoot, timeout: 2000 },
        );
        expect(child.error).toBeUndefined();
        expect(child.status).toBe(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
  it.skipIf(process.platform === "win32")(
    "preserves existing doc mode under a restrictive umask",
    () => {
      const root = mkdtempSync(join(tmpdir(), "doolittle-doc-mode-"));
      const path = join(root, "generated.md");
      writeFileSync(path, "old\n");
      chmodSync(path, 0o644);
      const previousUmask = process.umask(0o077);
      try {
        writeGeneratedDocFile(root, "generated.md", "new\n");
        expect(statSync(path).mode & 0o777).toBe(0o644);
      } finally {
        process.umask(previousUmask);
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
  it.skipIf(process.platform === "win32")(
    "does not write through a symlinked generated-doc directory",
    () => {
      const root = mkdtempSync(join(tmpdir(), "doolittle-doc-write-"));
      const outside = mkdtempSync(join(tmpdir(), "doolittle-doc-outside-"));
      try {
        symlinkSync(outside, join(root, "docs"));
        expect(() =>
          writeGeneratedDocFile(root, "docs/generated.md", "truth\n"),
        ).toThrow("unsafe");
        expect(existsSync(join(outside, "generated.md"))).toBe(false);
        writeGeneratedDocFile(root, "generated.md", "truth\n");
        expect(readFileSync(join(root, "generated.md"), "utf8")).toBe(
          "truth\n",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
      }
    },
  );
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

  it.skipIf(process.platform === "win32")(
    "rejects links that resolve outside the documentation root",
    () => {
      const root = mkdtempSync(join(tmpdir(), "doolittle-doc-links-"));
      const outside = mkdtempSync(join(tmpdir(), "doolittle-doc-outside-"));
      try {
        writeFileSync(join(outside, "secret.md"), "# Secret\n");
        symlinkSync(join(outside, "secret.md"), join(root, "linked.md"));
        writeFileSync(
          join(root, "README.md"),
          "[outside](./linked.md#secret)\n",
        );
        expect(validateMarkdownLinks(root, ["README.md"])).toEqual([
          "README.md:1: missing link target: ./linked.md#secret",
        ]);
      } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
      }
    },
  );

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
