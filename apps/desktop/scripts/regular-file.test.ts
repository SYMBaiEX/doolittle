import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readRegularFile } from "./regular-file";

const hooks = vi.hoisted(() => ({
  afterFirstStat: undefined as (() => void) | undefined,
}));
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    fstatSync: (fd: number) => {
      const info = fs.fstatSync(fd);
      const hook = hooks.afterFirstStat;
      hooks.afterFirstStat = undefined;
      hook?.();
      return info;
    },
  };
});
afterEach(() => {
  hooks.afterFirstStat = undefined;
});

describe("desktop release input read", () => {
  it("reads bounded regular files and rejects an oversized file", () => {
    const root = mkdtempSync(join(tmpdir(), "desktop-regular-"));
    try {
      const path = join(root, "file.txt");
      writeFileSync(path, "hello");
      expect(readRegularFile(path).toString()).toBe("hello");
      expect(() => readRegularFile(path, 4)).toThrow("bounded regular file");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects growth after initial stat, including zero-byte files", () => {
    const root = mkdtempSync(join(tmpdir(), "desktop-regular-growth-"));
    try {
      const path = join(root, "file.txt");
      writeFileSync(path, "ok");
      hooks.afterFirstStat = () => writeFileSync(path, "growing");
      expect(() => readRegularFile(path, 2)).toThrow("changed while reading");
      writeFileSync(path, "");
      hooks.afterFirstStat = () => writeFileSync(path, "x");
      expect(() => readRegularFile(path, 0)).toThrow("changed while reading");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "rejects FIFO inputs without waiting for a writer",
    () => {
      const root = mkdtempSync(join(tmpdir(), "desktop-regular-fifo-"));
      try {
        const path = join(root, "pipe");
        expect(spawnSync("mkfifo", [path]).status).toBe(0);
        const child = spawnSync(
          "nub",
          [
            "-e",
            "import { readRegularFile } from './apps/desktop/scripts/regular-file.ts'; try { readRegularFile(process.argv[1]); process.exit(2); } catch { process.exit(0); }",
            path,
          ],
          { cwd: join(import.meta.dirname, "../../.."), timeout: 2000 },
        );
        expect(child.error).toBeUndefined();
        expect(child.status).toBe(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "does not follow a final symlink",
    () => {
      const root = mkdtempSync(join(tmpdir(), "desktop-regular-"));
      try {
        writeFileSync(join(root, "file.txt"), "hello");
        symlinkSync(join(root, "file.txt"), join(root, "link.txt"));
        expect(() => readRegularFile(join(root, "link.txt"))).toThrow();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
