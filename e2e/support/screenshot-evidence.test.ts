import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareScreenshotEvidence } from "./screenshot-evidence";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, mkdirSync: vi.fn(actual.mkdirSync) };
});
const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-evidence-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  vi.mocked(mkdirSync).mockReset().mockImplementation(actualFs.mkdirSync);
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("screenshot evidence cleanup", () => {
  it("cleans only generated route files and preserves unrelated files and nested directories", () => {
    const root = join(fixture(), "screenshots");
    const config = prepareScreenshotEvidence(root, ["chat"]);
    writeFileSync(join(config.desktopDir, "chat.png"), "old");
    writeFileSync(join(config.desktopDir, "notes.txt"), "keep");
    mkdirSync(join(config.desktopDir, "project"));
    prepareScreenshotEvidence(root, ["chat"]);
    expect(existsSync(join(config.desktopDir, "chat.png"))).toBe(false);
    expect(readFileSync(join(config.desktopDir, "notes.txt"), "utf8")).toBe(
      "keep",
    );
    expect(existsSync(join(config.desktopDir, "project"))).toBe(true);
  });
  it("rejects broad output roots and route traversal", () => {
    // A guard regression must never create or clean real root/home directories.
    vi.mocked(mkdirSync).mockImplementation(() => {
      throw new Error("Unsafe directory creation reached in broad-root test");
    });
    for (const root of [
      parse(resolve("/")).root,
      homedir(),
      process.cwd(),
      tmpdir(),
    ]) {
      expect(() => prepareScreenshotEvidence(root, ["chat"])).toThrow(
        "dedicated",
      );
    }
    expect(mkdirSync).not.toHaveBeenCalled();
    expect(() =>
      prepareScreenshotEvidence(join(fixture(), "screenshots"), ["../outside"]),
    ).toThrow("static");
  });
  it("rejects linked children before cleanup and recovers after link removal", () => {
    const parent = fixture();
    const root = join(parent, "screenshots");
    const target = join(parent, "unrelated");
    mkdirSync(root);
    mkdirSync(target);
    writeFileSync(join(target, "chat.png"), "keep");
    symlinkSync(target, join(root, "desktop"), "dir");
    expect(() => prepareScreenshotEvidence(root, ["chat"])).toThrow("symlinks");
    expect(readFileSync(join(target, "chat.png"), "utf8")).toBe("keep");
    unlinkSync(join(root, "desktop"));
    expect(prepareScreenshotEvidence(root, ["chat"]).desktopDir).toContain(
      "desktop",
    );
  });
  it("rejects a symlink output root", () => {
    const parent = fixture();
    const target = join(parent, "target");
    mkdirSync(target);
    const link = join(parent, "link");
    symlinkSync(target, link, "dir");
    expect(() => prepareScreenshotEvidence(link, ["chat"])).toThrow("symlink");
  });
});
