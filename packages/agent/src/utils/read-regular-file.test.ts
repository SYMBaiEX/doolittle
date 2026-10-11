import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readRegularFileSync } from "./read-regular-file";

const hooks = vi.hoisted(() => ({
  afterStat: undefined as (() => void) | undefined,
}));
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    fstatSync: (descriptor: number) => {
      const info = fs.fstatSync(descriptor);
      const afterStat = hooks.afterStat;
      hooks.afterStat = undefined;
      afterStat?.();
      return info;
    },
  };
});
afterEach(() => {
  hooks.afterStat = undefined;
});

describe("bounded regular file reads", () => {
  it("rejects shrinkage rather than returning a truncated stable value", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-regular-shrink-"));
    const path = join(root, "file");
    try {
      writeFileSync(path, "original");
      hooks.afterStat = () => writeFileSync(path, "short");
      expect(() => readRegularFileSync(path, 100)).toThrow(
        "shrank during the bounded read",
      );
      expect(readRegularFileSync(path, 100).toString()).toBe("short");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a same-size write with changed file metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-regular-rewrite-"));
    const path = join(root, "file");
    try {
      writeFileSync(path, "original");
      hooks.afterStat = () => {
        writeFileSync(path, "modified");
        const future = new Date(Date.now() + 60_000);
        utimesSync(path, future, future);
      };
      expect(() => readRegularFileSync(path, 100)).toThrow(
        "changed during the bounded read",
      );
      expect(readRegularFileSync(path, 100).toString()).toBe("modified");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects growth of the same opened file after the size check", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-regular-growth-"));
    const path = join(root, "file");
    try {
      writeFileSync(path, "ok");
      hooks.afterStat = () => writeFileSync(path, "growing-file");
      expect(() => readRegularFileSync(path, 100)).toThrow(
        "grew during the bounded read",
      );
      writeFileSync(path, "safe");
      expect(readRegularFileSync(path, 100).toString()).toBe("safe");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "fails closed if the pinned leaf entry is swapped after stat",
    () => {
      const root = mkdtempSync(join(tmpdir(), "doolittle-regular-swap-"));
      const path = join(root, "file");
      const target = join(root, "target");
      try {
        writeFileSync(path, "safe");
        writeFileSync(target, "private");
        hooks.afterStat = () => {
          unlinkSync(path);
          symlinkSync(target, path);
        };
        expect(() => readRegularFileSync(path, 100)).toThrow(
          "changed during the bounded read",
        );
        expect(() => readRegularFileSync(path, 100)).toThrow();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it.each([
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
  ])("rejects an invalid read cap %s before opening a path", (limit) => {
    expect(() => readRegularFileSync("/not-opened", limit)).toThrow(
      "nonnegative safe integer",
    );
  });

  it("reads normal files, rejects oversized files, and recovers after replacement", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-regular-read-"));
    const path = join(root, "file");
    try {
      writeFileSync(path, "ok");
      expect(readRegularFileSync(path, 2).toString()).toBe("ok");
      writeFileSync(path, "oversized");
      expect(() => readRegularFileSync(path, 2)).toThrow(
        "bounded regular file",
      );
      writeFileSync(path, "ok");
      expect(readRegularFileSync(path, 2).toString()).toBe("ok");
      expect(() => readRegularFileSync(root, 2)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "rejects final symlinks and permits a subsequent regular file",
    () => {
      const root = mkdtempSync(join(tmpdir(), "doolittle-regular-link-"));
      const target = join(root, "target");
      const path = join(root, "file");
      try {
        writeFileSync(target, "private");
        symlinkSync(target, path);
        expect(() => readRegularFileSync(path, 100)).toThrow();
        unlinkSync(path);
        writeFileSync(path, "safe");
        expect(readRegularFileSync(path, 100).toString()).toBe("safe");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
