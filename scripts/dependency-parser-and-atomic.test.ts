import { spawnSync } from "node:child_process";
import fs, {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import fsp from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  writeJsonAtomic,
  writeJsonAtomicSync,
} from "@elizaos/agent/utils/atomic-json";
import { describe, expect, it, vi } from "vitest";

const rootRequire = createRequire(
  resolve(import.meta.dirname, "../package.json"),
);
const jimpRequire = createRequire(
  rootRequire.resolve("@jimp/custom/package.json"),
);

describe("patched dependency parsers and atomic writes", () => {
  it("bounds malformed ASF detection in a child and preserves PNG and ASF detection", async () => {
    const fileType = jimpRequire("file-type") as {
      fromBuffer(input: Buffer): Promise<{ ext: string } | undefined>;
    };
    expect(jimpRequire("file-type/package.json").version).toBe("16.5.4");
    const malformed = Buffer.alloc(55);
    malformed.set([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9]);
    const probe = spawnSync(
      process.execPath,
      [
        "-e",
        `require(${JSON.stringify(jimpRequire.resolve("file-type"))}).fromBuffer(Buffer.from(${JSON.stringify(malformed.toString("base64"))}, "base64")).then(value => { if (value !== undefined) process.exitCode = 2; })`,
      ],
      { timeout: 1_000, encoding: "utf8" },
    );
    expect(probe.error).toBeUndefined();
    expect(probe.status, probe.stderr).toBe(0);
    expect(
      (
        await fileType.fromBuffer(
          Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
        )
      )?.ext,
    ).toBe("png");
    const asf = Buffer.alloc(55);
    malformed.copy(asf, 0, 0, 10);
    asf.writeBigUInt64LE(25n, 46);
    expect((await fileType.fromBuffer(asf))?.ext).toBe("asf");
    const Jimp = rootRequire("jimp") as {
      new (
        width: number,
        height: number,
        color: number,
      ): { getBufferAsync(mime: string): Promise<Buffer> };
      MIME_PNG: string;
      read(
        data: Buffer,
      ): Promise<{ bitmap: { width: number; height: number } }>;
    };
    const png = await new Jimp(1, 1, 0xff0000ff).getBufferAsync(Jimp.MIME_PNG);
    expect((await Jimp.read(png)).bitmap).toMatchObject({
      width: 1,
      height: 1,
    });
  });

  it("uses unpredictable exclusive private temp files for async and sync writes", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "doolittle-atomic-"));
    try {
      const target = resolve(dir, "state.json");
      const outside = resolve(dir, "outside.txt");
      writeFileSync(outside, "untouched");
      const fixedTime = 1_700_000_000_000;
      const oldNow = Date.now;
      Date.now = () => fixedTime;
      try {
        symlinkSync(outside, `${target}.tmp-${process.pid}-${fixedTime}`);
        await writeJsonAtomic(target, { async: true });
        expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({
          async: true,
        });
        writeJsonAtomicSync(target, { sync: true });
        expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({
          sync: true,
        });
      } finally {
        Date.now = oldNow;
      }
      expect(readFileSync(outside, "utf8")).toBe("untouched");
      expect(lstatSync(target).mode & 0o777).toBe(0o600);
      expect(
        readdirSync(dir).filter((name) => name.startsWith("state.json.tmp-")),
      ).toEqual([`state.json.tmp-${process.pid}-${fixedTime}`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("cleans up the temporary file when rename fails", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "doolittle-atomic-failure-"));
    try {
      const target = resolve(dir, "directory-target");
      mkdirSync(target);
      await expect(writeJsonAtomic(target, { value: 1 })).rejects.toThrow();
      expect(() => writeJsonAtomicSync(target, { value: 2 })).toThrow();
      expect(existsSync(target)).toBe(true);
      expect(readdirSync(dir)).toEqual(["directory-target"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never removes or writes through a colliding unowned temp entry", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "doolittle-atomic-collision-"));
    const target = resolve(dir, "state.json");
    const outside = resolve(dir, "outside.txt");
    writeFileSync(target, "original");
    writeFileSync(outside, "outside");
    const planted: string[] = [];
    const plant = (candidate: string) => {
      symlinkSync(outside, candidate);
      planted.push(candidate);
    };
    const originalAsyncOpen = fsp.open.bind(fsp);
    const originalSyncOpen = fs.openSync.bind(fs);
    const asyncSpy = vi
      .spyOn(fsp, "open")
      .mockImplementation(async (...args) => {
        plant(String(args[0]));
        return originalAsyncOpen(...args);
      });
    const syncSpy = vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      plant(String(args[0]));
      return originalSyncOpen(...args);
    });
    try {
      await expect(writeJsonAtomic(target, { value: 1 })).rejects.toThrow();
      expect(() => writeJsonAtomicSync(target, { value: 2 })).toThrow();
      expect(planted).toHaveLength(2);
      for (const candidate of planted)
        expect(lstatSync(candidate).isSymbolicLink()).toBe(true);
      expect(readFileSync(target, "utf8")).toBe("original");
      expect(readFileSync(outside, "utf8")).toBe("outside");
    } finally {
      asyncSpy.mockRestore();
      syncSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
