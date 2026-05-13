import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFileActions,
  createLocalDirectory,
  patchLocalTextFile,
  readLocalTextFile,
  resolveLocalFilePath,
  searchLocalFiles,
  writeLocalTextFile,
} from "./file-action";

function withTempHome<T>(
  callback: (paths: { home: string; dev: string }) => T,
): T {
  const parent = join(tmpdir(), `doolittle-file-action-${Date.now()}`);
  const home = join(parent, "symbiex");
  const dev = join(home, "dev");
  mkdirSync(dev, { recursive: true });

  const previousHome = process.env.HOME;
  process.env.HOME = home;
  const cleanup = () => {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    rmSync(parent, { recursive: true, force: true });
  };
  try {
    const result = callback({ home, dev });
    if (result instanceof Promise) {
      return result.finally(cleanup) as T;
    }
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

describe("file actions", () => {
  it("resolves account-qualified dev paths into the local home dev root", () => {
    withTempHome(({ dev }) => {
      expect(
        resolveLocalFilePath("symbiex/dev/the-effect/index.html", dev),
      ).toBe(join(dev, "the-effect", "index.html"));
    });
  });

  it("writes files and creates parent directories under a dev root", () => {
    withTempHome(({ dev }) => {
      const response = writeLocalTextFile(
        { workspaceDir: dev },
        "symbiex/dev/the-effect/index.html",
        "<h1>Doolittle</h1>\n",
      );
      const target = join(dev, "the-effect", "index.html");
      expect(response).toContain(target);
      expect(readFileSync(target, "utf8")).toContain("Doolittle");
    });
  });

  it("creates directories as first-class local file operations", () => {
    withTempHome(({ dev }) => {
      const target = join(dev, "the-effect");
      const response = createLocalDirectory(
        { workspaceDir: dev },
        "symbiex/dev/the-effect",
      );
      expect(response).toContain(target);
      expect(existsSync(target)).toBe(true);
    });
  });

  it("reads with line numbers and patches targeted text", () => {
    withTempHome(({ dev }) => {
      const target = join(dev, "notes.md");
      writeLocalTextFile({ workspaceDir: dev }, target, "one\ntwo\nthree\n");

      expect(
        readLocalTextFile({ workspaceDir: dev }, target, { offset: 2 }),
      ).toContain("2|two");
      expect(
        patchLocalTextFile({ workspaceDir: dev }, target, "two", "TWO"),
      ).toContain("Replacements: 1");
      expect(readFileSync(target, "utf8")).toContain("TWO");
    });
  });

  it("searches local files without falling back to terminal grep/find", () => {
    withTempHome(({ dev }) => {
      writeLocalTextFile(
        { workspaceDir: dev },
        "symbiex/dev/the-effect/script.js",
        "const signal = 'alive';\n",
      );
      expect(
        searchLocalFiles({ workspaceDir: dev }, { pattern: "signal" }),
      ).toContain("script.js:1");
      expect(
        searchLocalFiles(
          { workspaceDir: dev },
          { pattern: "script", target: "files" },
        ),
      ).toContain("script.js");
    });
  });

  it("keeps SEARCH_FILES target separate from the search path", async () => {
    await withTempHome(async ({ dev }) => {
      writeLocalTextFile(
        { workspaceDir: dev },
        "symbiex/dev/the-effect/script.js",
        "const signal = 'alive';\n",
      );
      const searchAction = createFileActions(dev).find(
        (action) => action.name === "SEARCH_FILES",
      );
      const result = await searchAction?.handler(
        {} as never,
        { content: { text: "find script files" } } as never,
        undefined,
        { parameters: { pattern: "script", target: "files" } },
      );
      expect(result?.success).toBe(true);
      expect(result?.text).toContain("script.js");
    });
  });

  it("rejects paths outside the configured local development roots", () => {
    withTempHome(({ dev }) => {
      expect(() => resolveLocalFilePath("/tmp/not-doolittle.txt", dev)).toThrow(
        "local development root",
      );
    });
  });
});
