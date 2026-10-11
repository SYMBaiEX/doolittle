import {
  appendFileSync,
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readBoundedRegularFile,
  readRegularFileDescriptor,
  writeVerifiedFileSync,
} from "./regular-file";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readSync: vi.fn(actual.readSync) };
});

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-regular-file-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("bounded descriptor file access", () => {
  it("rejects growth between descriptor inspection and the bounded read", async () => {
    const path = join(fixture(), "state.json");
    writeFileSync(path, "abc");
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(readSync).mockImplementationOnce((...args) => {
      appendFileSync(path, "unreviewed growth");
      return actual.readSync(...args);
    });
    expect(() => readBoundedRegularFile(path, 3)).toThrow(/changed/u);
  });
  it("accepts exact-size and empty regular files", () => {
    const path = join(fixture(), "state.json");
    writeFileSync(path, "abc");
    expect(readBoundedRegularFile(path, 3).toString()).toBe("abc");
    writeFileSync(path, "");
    expect(readBoundedRegularFile(path, 0).byteLength).toBe(0);
  });

  it("rejects oversize data before reading and rejects directories", () => {
    const root = fixture();
    const path = join(root, "state.json");
    writeFileSync(path, "abcd");
    expect(() => readBoundedRegularFile(path, 3)).toThrow(/too_large/u);
    const directory = join(root, "directory");
    mkdirSync(directory);
    expect(() => readBoundedRegularFile(directory, 10)).toThrow();
    expect(() => readBoundedRegularFile(path, -1)).toThrow(/byte limit/u);
  });

  it.skipIf(process.platform === "win32")(
    "rejects final-component symlinks",
    () => {
      const root = fixture();
      const source = join(root, "source.json");
      const link = join(root, "state.json");
      writeFileSync(source, "secret");
      symlinkSync(source, link);
      expect(() => readBoundedRegularFile(link, 100)).toThrow();
    },
  );

  it.skipIf(process.platform === "win32")(
    "keeps reading the opened inode after pathname replacement",
    () => {
      const root = fixture();
      const path = join(root, "state.json");
      writeFileSync(path, "reviewed");
      const fd = openSync(path, "r");
      try {
        renameSync(path, join(root, "original.json"));
        writeFileSync(path, "replacement");
        expect(readRegularFileDescriptor(fd, 20).toString()).toBe("reviewed");
      } finally {
        closeSync(fd);
      }
    },
  );

  it("exclusively creates and verifies staged bytes without overwriting existing files", () => {
    const path = join(fixture(), "stage");
    writeVerifiedFileSync(path, Buffer.from("reviewed"));
    expect(readFileSync(path).toString()).toBe("reviewed");
    expect(() =>
      writeVerifiedFileSync(path, Buffer.from("replacement")),
    ).toThrow();
    expect(readFileSync(path).toString()).toBe("reviewed");
  });
});
