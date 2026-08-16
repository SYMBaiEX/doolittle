import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeNativePackageReceipt } from "../apps/desktop/scripts/package-provenance";
import {
  createDesktopRelease,
  expectedDesktopReleaseArtifacts,
} from "./create-desktop-release";

const temporaryDirectories: string[] = [];

function releaseDirectory(version = "0.1.0"): string {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-release-"));
  temporaryDirectories.push(directory);
  for (const artifact of expectedDesktopReleaseArtifacts(version)) {
    const primaryArtifacts: Record<string, string> = {
      "latest-linux.yml": `Doolittle-${version}-linux-x64.AppImage`,
      "latest-mac.yml": `Doolittle-${version}-mac-arm64.zip`,
      "latest.yml": `Doolittle-${version}-win-x64.exe`,
    };
    const primaryArtifact = primaryArtifacts[artifact.path];
    writeFileSync(
      join(directory, artifact.path),
      artifact.path === "LICENSE"
        ? "MIT License\nCopyright (c) 2026 SYMBaiEX\n"
        : primaryArtifact
          ? `version: ${version}\npath: ${primaryArtifact}\n`
          : `fixture:${artifact.path}\n`,
    );
  }
  for (const platform of ["linux", "macos", "windows"] as const) {
    const appAsar = `app-${platform}.asar`;
    writeFileSync(join(directory, appAsar), `fixture:${appAsar}\n`);
    writeNativePackageReceipt({
      releaseDirectory: directory,
      platform,
      commit: "a".repeat(40),
      appAsarPath: appAsar,
      artifactPaths: expectedDesktopReleaseArtifacts(version)
        .filter((artifact) => artifact.platform === platform)
        .map((artifact) => artifact.path),
    });
    rmSync(join(directory, appAsar));
  }
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("desktop release aggregation", () => {
  it("binds the exact native artifact set to version, tag, and commit", async () => {
    const directory = releaseDirectory();
    const manifest = await createDesktopRelease({
      directory,
      version: "0.1.0",
      tag: "v0.1.0",
      commit: "a".repeat(40),
      generatedAt: "2026-08-14T00:00:00.000Z",
    });

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      product: "Doolittle",
      version: "0.1.0",
      tag: "v0.1.0",
      commit: "a".repeat(40),
      generatedAt: "2026-08-14T00:00:00.000Z",
    });
    expect(manifest.artifacts).toHaveLength(15);
    expect(manifest.artifacts).toContainEqual(
      expect.objectContaining({
        path: "LICENSE",
        platform: "release",
        architecture: "all",
      }),
    );
    expect(manifest.artifacts).toContainEqual(
      expect.objectContaining({
        path: "Doolittle-0.1.0-mac-arm64.dmg",
        platform: "macos",
        architecture: "arm64",
      }),
    );
    expect(manifest.artifacts).toContainEqual(
      expect.objectContaining({
        path: "Doolittle-0.1.0-linux-x64.AppImage",
        platform: "linux",
        architecture: "x64",
      }),
    );
    expect(manifest.artifacts).toContainEqual(
      expect.objectContaining({
        path: "desktop-provenance-macos.json",
        platform: "release",
        architecture: "all",
      }),
    );
    const sums = readFileSync(join(directory, "SHA256SUMS.txt"), "utf8");
    expect(sums.trim().split("\n")).toHaveLength(15);
    expect(
      JSON.parse(
        readFileSync(join(directory, "release-manifest.json"), "utf8"),
      ),
    ).toEqual(manifest);
  });

  it("rejects tag mismatches, missing artifacts, and unexpected files", async () => {
    const directory = releaseDirectory();
    await expect(
      createDesktopRelease({
        directory,
        version: "0.1.0",
        tag: "v0.2.0",
        commit: "a".repeat(40),
      }),
    ).rejects.toThrow("must equal v0.1.0");

    rmSync(join(directory, "latest.yml"));
    writeFileSync(join(directory, "Doolittle-0.1.0-linux-arm64.deb"), "wrong");
    await expect(
      createDesktopRelease({
        directory,
        version: "0.1.0",
        tag: "v0.1.0",
        commit: "a".repeat(40),
      }),
    ).rejects.toThrow(
      "missing: latest.yml; unexpected: Doolittle-0.1.0-linux-arm64.deb",
    );
  });

  it("rejects stale update metadata", async () => {
    const directory = releaseDirectory();
    writeFileSync(
      join(directory, "latest-mac.yml"),
      "version: 0.0.9\npath: Doolittle-0.0.9-mac-arm64.zip\n",
    );

    await expect(
      createDesktopRelease({
        directory,
        version: "0.1.0",
        tag: "v0.1.0",
        commit: "a".repeat(40),
      }),
    ).rejects.toThrow(
      "latest-mac.yml must identify version 0.1.0 and Doolittle-0.1.0-mac-arm64.zip",
    );
  });

  it("rejects missing, cross-commit, and mismatched native provenance receipts", async () => {
    const directory = releaseDirectory();
    rmSync(join(directory, "desktop-provenance-linux.json"));
    await expect(
      createDesktopRelease({
        directory,
        version: "0.1.0",
        tag: "v0.1.0",
        commit: "a".repeat(40),
      }),
    ).rejects.toThrow("missing: desktop-provenance-linux.json");

    const crossCommit = releaseDirectory();
    const receiptPath = join(crossCommit, "desktop-provenance-macos.json");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.commit = "b".repeat(40);
    writeFileSync(receiptPath, JSON.stringify(receipt));
    await expect(
      createDesktopRelease({
        directory: crossCommit,
        version: "0.1.0",
        tag: "v0.1.0",
        commit: "a".repeat(40),
      }),
    ).rejects.toThrow("Invalid native provenance receipt");

    const mismatch = releaseDirectory();
    writeFileSync(
      join(mismatch, "Doolittle-0.1.0-linux-x64.AppImage"),
      "tampered",
    );
    await expect(
      createDesktopRelease({
        directory: mismatch,
        version: "0.1.0",
        tag: "v0.1.0",
        commit: "a".repeat(40),
      }),
    ).rejects.toThrow("Native provenance receipt hash mismatch");
  });
});
