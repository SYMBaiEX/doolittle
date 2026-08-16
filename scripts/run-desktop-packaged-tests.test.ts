import { describe, expect, it } from "vitest";
import {
  assertRepositoryPackageProvenance,
  packagedAppAsarPath,
  packagedTestCandidates,
  resolvePackagedTestExecutable,
} from "./run-desktop-packaged-tests";

describe("packaged desktop test launcher", () => {
  it("uses repository-owned unpacked applications on every platform", () => {
    expect(packagedTestCandidates("darwin", "/repo", "arm64")).toEqual([
      "/repo/apps/desktop/release/mac-arm64/Doolittle.app/Contents/MacOS/Doolittle",
      "/repo/apps/desktop/release/mac/Doolittle.app/Contents/MacOS/Doolittle",
    ]);
    expect(packagedTestCandidates("win32", "/repo")).toEqual([
      "/repo/apps/desktop/release/win-x64-unpacked/Doolittle.exe",
      "/repo/apps/desktop/release/win-unpacked/Doolittle.exe",
    ]);
    expect(packagedTestCandidates("linux", "/repo")).toEqual([
      "/repo/apps/desktop/release/linux-x64-unpacked/Doolittle",
      "/repo/apps/desktop/release/linux-unpacked/Doolittle",
    ]);
  });

  it("honors an explicit executable", () => {
    expect(
      resolvePackagedTestExecutable({
        candidates: ["/repo/package"],
        requestedExecutable: "/installed/Doolittle",
        isExecutable: (path) => path === "/installed/Doolittle",
      }),
    ).toBe("/installed/Doolittle");
  });

  it("selects the first available packaged candidate", () => {
    expect(
      resolvePackagedTestExecutable({
        candidates: ["/repo/package", "/repo/fallback-package"],
        isExecutable: (path) => path === "/repo/fallback-package",
      }),
    ).toBe("/repo/fallback-package");
  });

  it("fails closed instead of reporting skipped tests", () => {
    expect(() =>
      resolvePackagedTestExecutable({
        candidates: ["/repo/missing"],
        isExecutable: () => false,
      }),
    ).toThrow("No packaged Doolittle executable was found");
    expect(() =>
      resolvePackagedTestExecutable({
        candidates: [],
        requestedExecutable: "/missing/Doolittle",
        isExecutable: () => false,
      }),
    ).toThrow("does not identify a packaged executable");
  });

  it("derives the app archive behind packaged executables", () => {
    expect(
      packagedAppAsarPath(
        "/repo/release/mac-arm64/Doolittle.app/Contents/MacOS/Doolittle",
      ),
    ).toBe("/repo/release/mac-arm64/Doolittle.app/Contents/Resources/app.asar");
    expect(packagedAppAsarPath("/repo/release/win/Doolittle.exe")).toBe(
      "/repo/release/win/resources/app.asar",
    );
  });

  it("requires a clean, current, hash-matched repository package", () => {
    const valid = {
      sourceRevision: "abc123",
      worktreeClean: true,
      manifestRevision: "abc123",
      appAsarPath: "mac-arm64/Doolittle.app/Contents/Resources/app.asar",
      manifestAppAsarPath:
        "mac-arm64/Doolittle.app/Contents/Resources/app.asar",
      appAsarSha256: "hash",
      manifestAppAsarSha256: "hash",
    };
    expect(() => assertRepositoryPackageProvenance(valid)).not.toThrow();
    expect(() =>
      assertRepositoryPackageProvenance({ ...valid, worktreeClean: false }),
    ).toThrow(/worktree is dirty/i);
    expect(() =>
      assertRepositoryPackageProvenance({
        ...valid,
        manifestRevision: "stale",
      }),
    ).toThrow(/current HEAD/i);
    expect(() =>
      assertRepositoryPackageProvenance({
        ...valid,
        manifestAppAsarSha256: "stale",
      }),
    ).toThrow(/release manifest/i);
  });
});
