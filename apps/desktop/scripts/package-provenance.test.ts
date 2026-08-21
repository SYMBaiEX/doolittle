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
  writeFileSync(join(directory, "linux-unpacked/resources/app.asar"), "asar\n");
  writeFileSync(join(directory, "artifact.AppImage"), "artifact\n");
  return { directory, runtime };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("package runtime provenance", () => {
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
      entries: 4,
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
      appAsarPath: "linux-unpacked/resources/app.asar",
      artifactPaths: ["artifact.AppImage"],
    });

    expect(
      verifyNativePackageRuntime({
        releaseDirectory: directory,
        platform: "linux",
        runtimeDirectory: runtime,
      }),
    ).toMatchObject({ entries: 3 });

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
