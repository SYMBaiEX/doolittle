import * as fs from "node:fs";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  preparePrivateReportDirectory,
  privateReportFilename,
  privateReportPath,
  privateReportStateRoot,
  writePrivateReportFile,
} from "./private-report";

vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
}));

const roots: string[] = [];
function root() {
  const path = mkdtempSync(join(tmpdir(), "private-report-test-"));
  roots.push(path);
  return path;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const path of roots.splice(0))
    rmSync(path, { recursive: true, force: true });
});
describe("owned private headless report storage", () => {
  it("closes actual descriptors and reports content-free close failures", () => {
    const path = root();
    const directory = preparePrivateReportDirectory(path);
    const originalClose = fs.closeSync;
    const close = vi.spyOn(fs, "closeSync").mockImplementation((fd) => {
      originalClose(fd);
      throw new Error("PRIVATE_SECRET_CLOSE_ERROR");
    });
    expect(() =>
      writePrivateReportFile(directory, "report.json", "content-free"),
    ).toThrow("Headless private report write failed.");
    expect(close).toHaveBeenCalledTimes(2);
    expect(readFileSync(join(path, "report.json"), "utf8")).toBe(
      "content-free",
    );
  });
  it("validates the created descriptor before writing bytes", () => {
    const path = root();
    const directory = preparePrivateReportDirectory(path);
    const writes = vi.spyOn(fs, "writeFileSync");
    const originalStat = fs.fstatSync;
    vi.spyOn(fs, "fstatSync").mockImplementation((...args) => {
      const stat = originalStat(...args);
      if (stat.isFile()) stat.isFile = () => false;
      return stat;
    });
    expect(() =>
      writePrivateReportFile(directory, "report.json", "PRIVATE_CANARY"),
    ).toThrow();
    expect(writes).not.toHaveBeenCalled();
    expect(statSync(join(path, "report.json")).size).toBe(0);
  });
  it("ignores relative XDG roots rather than resolving them into source", () => {
    expect(privateReportStateRoot("relative/../../secret", "/owned-home")).toBe(
      "/owned-home/.local/state",
    );
    expect(privateReportStateRoot("  /owned-state/a/..  ", "/owned-home")).toBe(
      "/owned-state",
    );
  });
  it("allows private operator storage and writes exclusive owner-only descriptors", () => {
    const path = root();
    const directory = preparePrivateReportDirectory(path);
    const leaf = privateReportFilename(
      "2026-10-03T01:02:03.004Z",
      "suite-v6",
      6,
    );
    expect(directory.path).toBe(realpathSync(path));
    writePrivateReportFile(directory, leaf, "content-free");
    expect(readFileSync(join(path, leaf), "utf8")).toBe("content-free");
    expect(statSync(join(path, leaf)).mode & 0o777).toBe(0o600);
    expect(() => writePrivateReportFile(directory, leaf, "replace")).toThrow();
    expect(readFileSync(join(path, leaf), "utf8")).toBe("content-free");
  });
  it("creates fixed XDG descendants within an absolute canonical state root", () => {
    const path = root();
    vi.stubEnv("XDG_STATE_HOME", join(path, "state", "..", "state"));
    const directory = preparePrivateReportDirectory();
    expect(directory.path).toBe(
      join(realpathSync(path), "state", "doolittle", "evals", "headless"),
    );
    expect(statSync(directory.path).mode & 0o777).toBe(0o700);
  });
  it("rejects unsafe existing permissions without chmod or secret errors", () => {
    const path = root();
    chmodSync(path, 0o755);
    expect(() => preparePrivateReportDirectory(path)).toThrow(
      "owned private directory",
    );
    expect(statSync(path).mode & 0o777).toBe(0o755);
  });
  it("rejects user-owned intermediate and terminal symlinks without touching foreign leaves", () => {
    const path = root();
    const foreign = root();
    writeFileSync(join(foreign, "sentinel"), "PRIVATE_CANARY");
    symlinkSync(foreign, join(path, "alias"), "dir");
    expect(() => preparePrivateReportDirectory(join(path, "alias"))).toThrow();
    expect(() =>
      preparePrivateReportDirectory(join(path, "alias", "reports")),
    ).toThrow();
    expect(readdirSync(foreign)).toEqual(["sentinel"]);
  });
  it("refuses substituted roots before writing any bytes", () => {
    const path = root();
    const target = join(path, "reports");
    mkdirSync(target, { mode: 0o700 });
    const directory = preparePrivateReportDirectory(target);
    renameSync(target, join(path, "original"));
    mkdirSync(target, { mode: 0o700 });
    writeFileSync(join(target, "sentinel"), "PRIVATE_CANARY");
    expect(() =>
      writePrivateReportFile(directory, "report.json", "secret"),
    ).toThrow();
    expect(readdirSync(target)).toEqual(["sentinel"]);
  });
  it.each(["../escape", "x/../../escape", "..", "a".repeat(129)])(
    "rejects unsafe suite %s",
    (id) => {
      expect(() =>
        privateReportFilename("2026-10-03T01:02:03.004Z", id, 1),
      ).toThrow();
    },
  );
  it("rejects unsafe dates, versions, leaves, and existing symlinks", () => {
    const path = root();
    const directory = preparePrivateReportDirectory(path);
    expect(() => privateReportFilename("../SECRET", "suite", 1)).toThrow();
    expect(() =>
      privateReportFilename("2026-10-03T01:02:03.004Z", "suite", Infinity),
    ).toThrow();
    expect(() => privateReportPath(directory, "../escape")).toThrow();
    const foreign = join(root(), "canary");
    writeFileSync(foreign, "PRIVATE_CANARY");
    symlinkSync(foreign, join(path, "report.json"));
    expect(() =>
      writePrivateReportFile(directory, "report.json", "replace"),
    ).toThrow();
    expect(readFileSync(foreign, "utf8")).toBe("PRIVATE_CANARY");
  });
});
