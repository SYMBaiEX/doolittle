import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  gitCommitCreatedAt,
  packageProvenanceRuntime,
  verifyNativePackageRuntime,
  writeNativePackageReceipt,
} from "./package-provenance";

const temporaryDirectories: string[] = [];

function fixture(): { directory: string; runtime: string } {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-provenance-"));
  temporaryDirectories.push(directory);
  const runtime = "linux-unpacked/resources/runtime";
  mkdirSync(join(directory, runtime, "bin"), { recursive: true });
  writeFileSync(
    join(directory, runtime, "bin", "doolittle-runtime.mjs"),
    "runtime\n",
  );
  writeFileSync(
    join(directory, runtime, "bin", "runtime-manifest.json"),
    `${JSON.stringify({
      bundledPackages: [{ name: "bundled", version: "1.0.0" }],
      nativePackageClosure: [{ name: "native", version: "2.0.0" }],
    })}\n`,
  );
  writeFileSync(join(directory, "linux-unpacked/resources/app.asar"), "asar\n");
  writeFileSync(
    join(directory, "linux-unpacked/resources/desktop-artifact-manifest.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      desktop: { name: "@doolittle/desktop", version: "0.1.0" },
      electron: { name: "electron", version: "43.4.1" },
      surfaces: ["main", "preload", "renderer"].map((surface) => ({
        schemaVersion: 1,
        surface,
        outputs: [{ path: `${surface}.js`, bytes: 1, sha256: "c".repeat(64) }],
        packages: [],
      })),
      appAsar: { productionPackages: [] },
      runtime: {
        manifest: {
          path: "runtime/bin/runtime-manifest.json",
          sha256: "a".repeat(64),
        },
        packages: [{ name: "native", version: "2.0.0" }],
      },
      dependencies: [
        { name: "electron", version: "43.4.1" },
        { name: "native", version: "2.0.0" },
      ],
      legal: [
        "LICENSE.electron.txt",
        "LICENSES.chromium.html",
        "THIRD-PARTY-NOTICES.txt",
      ].map((path) => ({
        path,
        bytes: 1,
        sha256: "b".repeat(64),
      })),
    })}\n`,
  );
  writeFileSync(join(directory, "artifact.AppImage"), "artifact\n");
  return { directory, runtime };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("package runtime provenance", () => {
  it("derives a normalized deterministic timestamp from the source commit", () => {
    const calls: string[][] = [];
    expect(
      gitCommitCreatedAt("/repo", "a".repeat(40), (args) => {
        calls.push(args);
        return { status: 0, stdout: "2026-08-21T15:00:00-05:00\n" };
      }),
    ).toBe("2026-08-21T20:00:00.000Z");
    expect(calls).toEqual([["show", "-s", "--format=%cI", "a".repeat(40)]]);
  });

  it("rejects an empty runtime tree", () => {
    const directory = mkdtempSync(join(tmpdir(), "doolittle-provenance-"));
    temporaryDirectories.push(directory);
    mkdirSync(join(directory, "runtime"));

    expect(() => packageProvenanceRuntime(directory, "runtime")).toThrow(
      "Packaged runtime directory is empty",
    );
  });

  it("is deterministic across runtime entry creation order", () => {
    const first = fixture();
    const second = fixture();
    writeFileSync(join(first.directory, first.runtime, "a.txt"), "a\n");
    writeFileSync(join(first.directory, first.runtime, "z.txt"), "z\n");
    writeFileSync(join(second.directory, second.runtime, "z.txt"), "z\n");
    writeFileSync(join(second.directory, second.runtime, "a.txt"), "a\n");

    expect(
      packageProvenanceRuntime(first.directory, first.runtime),
    ).toMatchObject({
      entries: 5,
      bytes: expect.any(Number),
      sha256: packageProvenanceRuntime(second.directory, second.runtime).sha256,
    });
  });

  it("binds regular files and symlink targets in the receipt", () => {
    const { directory, runtime } = fixture();
    symlinkSync("bin/doolittle-runtime.mjs", join(directory, runtime, "entry"));
    writeNativePackageReceipt({
      releaseDirectory: directory,
      platform: "linux",
      commit: "a".repeat(40),
      createdAt: "2026-08-21T20:00:00.000Z",
      appAsarPath: "linux-unpacked/resources/app.asar",
      artifactPaths: ["artifact.AppImage"],
    });

    expect(
      verifyNativePackageRuntime({
        releaseDirectory: directory,
        platform: "linux",
        runtimeDirectory: runtime,
      }),
    ).toMatchObject({ entries: 4 });

    writeFileSync(
      join(directory, runtime, "bin", "doolittle-runtime.mjs"),
      "changed\n",
    );
    expect(() =>
      verifyNativePackageRuntime({
        releaseDirectory: directory,
        platform: "linux",
        runtimeDirectory: runtime,
      }),
    ).toThrow("Packaged runtime does not match");
  });
});
