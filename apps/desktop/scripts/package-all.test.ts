import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  directoryBuildArgs,
  directoryBuildInvalidatedMetadataPaths,
  nativeBuildArgs,
  nativeMetadataPathsFor,
  nativeReleaseTargetForArgs,
  requireNativeReleaseArtifacts,
  withTransactionalNativePackage,
} from "./package";
import {
  allPlatformInstallArgs,
  macAppBundlePath,
  missingNativeTargetPackages,
  releaseChecksumText,
  releaseTargetReceipt,
  releaseTargets,
  requiredNativeTargetPackages,
  resolveSingleExistingPath,
  supersededReleaseOutputNames,
  validatePackageHost,
  withTransactionalReleaseDirectory,
} from "./package-all";
import {
  assertPackageSourceUnchanged,
  requireCleanPackageSource,
} from "./package-provenance";

const desktopManifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../package.json", import.meta.url)),
    "utf8",
  ),
) as {
  author?: { email?: string };
  desktopName?: string;
  homepage?: string;
  scripts?: Record<string, string>;
  build?: {
    extraResources?: Array<{
      from?: string;
      to?: string;
      filter?: string[];
    }>;
    linux?: {
      artifactName?: string;
      maintainer?: string;
      syncDesktopName?: boolean;
    };
    mac?: {
      binaries?: string[];
    };
  };
};

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function gitCheckIgnore(path: string): number | null {
  return spawnSync("git", ["check-ignore", "--quiet", "--", path], {
    cwd: repoRoot,
  }).status;
}

describe("all-platform desktop release plan", () => {
  it("ignores only generated transactional release trees", () => {
    expect(
      gitCheckIgnore(
        "apps/desktop/.release-staging-transaction-proof/mac-arm64/Doolittle.app/Contents/Resources/app.asar",
      ),
    ).toBe(0);
    expect(
      gitCheckIgnore(
        "apps/desktop/release.backup-transaction-proof/SHA256SUMS.txt",
      ),
    ).toBe(0);
    expect(
      gitCheckIgnore("apps/desktop/src/__release_transaction_visibility__.ts"),
    ).toBe(1);
  });

  it("builds the supported macOS, Windows, and Linux artifacts", () => {
    expect(releaseTargets("0.1.0", "arm64")).toEqual([
      expect.objectContaining({
        id: "mac",
        builderArgs: ["--mac", "dmg", "zip", "--arm64"],
        artifacts: [
          "Doolittle-0.1.0-mac-arm64.dmg",
          "Doolittle-0.1.0-mac-arm64.zip",
        ],
      }),
      expect.objectContaining({
        id: "win",
        builderArgs: ["--win", "nsis", "--x64"],
        artifacts: ["Doolittle-0.1.0-win-x64.exe"],
      }),
      expect.objectContaining({
        id: "linux",
        builderArgs: ["--linux", "AppImage", "deb", "--x64"],
        artifacts: [
          "Doolittle-0.1.0-linux-x64.AppImage",
          "Doolittle-0.1.0-linux-x64.deb",
        ],
      }),
    ]);
  });

  it("rejects missing and ambiguous unpacked packages", () => {
    expect(() => resolveSingleExistingPath("/missing", ["one", "two"])).toThrow(
      "found 0",
    );
  });

  it("derives the staged macOS bundle for strict signature verification", () => {
    expect(
      macAppBundlePath(
        "/private/release/mac-arm64/Doolittle.app/Contents/Resources/app.asar",
      ),
    ).toBe("/private/release/mac-arm64/Doolittle.app");
  });

  it("routes directory builds into their private staging release tree", () => {
    expect(directoryBuildArgs(["--dir"], "/private/release-staging")).toEqual([
      "--dir",
      "--config.directories.output=/private/release-staging",
    ]);
    expect(directoryBuildInvalidatedMetadataPaths()).toEqual([
      "release-manifest.json",
    ]);
  });

  it("routes native builds into their private staging release tree without publishing", () => {
    expect(
      nativeBuildArgs(["--mac", "dmg", "zip"], "/private/release-staging"),
    ).toEqual([
      "--mac",
      "dmg",
      "zip",
      "--config.directories.output=/private/release-staging",
      "--publish",
      "never",
    ]);
    expect(
      nativeBuildArgs(["--win", "nsis", "--x64"], "/private/release-staging", {
        WIN_PUBLISHER_NAME: "CN=SYMBaiEX, O=SYMBaiEX",
      }),
    ).toContain(
      "--config.win.signtoolOptions.publisherName=CN=SYMBaiEX, O=SYMBaiEX",
    );
  });

  it("resolves a single native package target from its builder arguments", () => {
    expect(
      nativeReleaseTargetForArgs(
        ["--mac", "dmg", "zip"],
        "0.1.0",
        "arm64",
        "darwin",
      ).id,
    ).toBe("mac");
    expect(
      nativeReleaseTargetForArgs(
        ["--win", "nsis", "--x64"],
        "0.1.0",
        "arm64",
        "darwin",
      ).id,
    ).toBe("win");
    expect(
      nativeReleaseTargetForArgs(["--mac", "dmg"], "0.1.0", "arm64", "darwin")
        .artifacts,
    ).toEqual([
      "Doolittle-0.1.0-mac-arm64.dmg",
      "Doolittle-0.1.0-mac-arm64.zip",
    ]);
    expect(() =>
      nativeReleaseTargetForArgs(
        ["--mac", "--win"],
        "0.1.0",
        "arm64",
        "darwin",
      ),
    ).toThrow("one platform target at a time");
    expect(
      nativeMetadataPathsFor(
        nativeReleaseTargetForArgs(
          ["--mac", "dmg"],
          "0.1.0",
          "arm64",
          "darwin",
        ),
        "darwin",
      ),
    ).toEqual([
      "release-manifest.json",
      "SHA256SUMS.txt",
      "unpacked-manifest.json",
    ]);
    const root = mkdtempSync(join(tmpdir(), "doolittle-partial-native-"));
    try {
      const macTarget = nativeReleaseTargetForArgs(
        ["--mac", "dmg"],
        "0.1.0",
        "arm64",
        "darwin",
      );
      writeFileSync(join(root, macTarget.artifacts[0] ?? ""), "dmg");
      writeFileSync(
        join(root, `${macTarget.artifacts[0] ?? ""}.blockmap`),
        "dmg blockmap",
      );
      expect(() => requireNativeReleaseArtifacts(root, macTarget)).toThrow(
        "Doolittle-0.1.0-mac-arm64.zip",
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("installs and requires native binaries for every packaged target", () => {
    expect(allPlatformInstallArgs).toEqual([
      "install",
      "--frozen-lockfile",
      "--ignore-scripts",
      "--os",
      "darwin,win32,linux",
      "--cpu",
      "arm64,x64",
      "--libc",
      "glibc",
    ]);
    const required = requiredNativeTargetPackages("arm64");
    expect(required).toEqual([
      "@lydell/node-pty-darwin-arm64",
      "@lydell/node-pty-linux-x64",
      "@lydell/node-pty-win32-x64",
      "@snazzah/davey-darwin-arm64",
      "@snazzah/davey-linux-x64-gnu",
      "@snazzah/davey-win32-x64-msvc",
    ]);
    expect(missingNativeTargetPackages(required, required)).toEqual([]);
    expect(missingNativeTargetPackages(required, required.slice(1))).toEqual([
      "@lydell/node-pty-darwin-arm64",
    ]);
    expect(desktopManifest.build?.mac?.binaries).toEqual([
      "Contents/Resources/runtime/bin/node_modules/@lydell/node-pty-darwin-arm64/pty.node",
      "Contents/Resources/runtime/bin/node_modules/@lydell/node-pty-darwin-arm64/spawn-helper",
      "Contents/Resources/runtime/bin/node_modules/@snazzah/davey-darwin-arm64/davey.darwin-arm64.node",
    ]);
  });

  it("declares the metadata required by Linux package targets", () => {
    expect(desktopManifest).toMatchObject({
      homepage: "https://github.com/SYMBaiEX/doolittle",
      author: { email: "solsymbaiex@gmail.com" },
      desktopName: "Doolittle.desktop",
      build: {
        linux: {
          artifactName: "Doolittle-$" + "{version}-linux-x64.$" + "{ext}",
          maintainer: "SYMBaiEX <solsymbaiex@gmail.com>",
          syncDesktopName: true,
        },
      },
    });
  });

  it("includes Doolittle's license in every desktop distribution", () => {
    expect(desktopManifest.build?.extraResources).toContainEqual({
      from: "../../LICENSE",
      to: "LICENSE",
    });
  });

  it("excludes private generated-skill metadata from desktop distributions", () => {
    const skillsResource = desktopManifest.build?.extraResources?.find(
      (resource) => resource.from === "../../packages/skills",
    );
    expect(skillsResource?.filter).toContain("!**/.generated/**");
  });

  it("routes every desktop package command through the guarded package script", () => {
    const scripts = desktopManifest.scripts ?? {};
    for (const name of [
      "package",
      "package:dir",
      "package:mac",
      "package:win",
      "package:linux",
    ]) {
      expect(scripts[name]).toContain("scripts/package.ts");
      expect(scripts[name]).not.toContain("electron-builder");
    }
    const packageSource = readFileSync(
      fileURLToPath(new URL("./package.ts", import.meta.url)),
      "utf8",
    );
    expect(packageSource).toContain('"scripts/verify-package.ts"');
  });

  it("writes portable SHA-256 sums for every locally built installer", () => {
    expect(
      releaseChecksumText([
        { path: "Doolittle-0.1.0-mac-arm64.dmg", sha256: "a".repeat(64) },
        { path: "Doolittle-0.1.0-win-x64.exe", sha256: "b".repeat(64) },
      ]),
    ).toBe(
      `${"a".repeat(64)}  Doolittle-0.1.0-mac-arm64.dmg\n${"b".repeat(64)}  Doolittle-0.1.0-win-x64.exe\n`,
    );
  });

  it("binds every native target's full update set into a provenance receipt", () => {
    const [mac, windows, linux] = releaseTargets("0.1.0", "arm64");
    expect(releaseTargetReceipt(mac)).toEqual({
      platform: "macos",
      artifacts: [
        "Doolittle-0.1.0-mac-arm64.dmg",
        "Doolittle-0.1.0-mac-arm64.dmg.blockmap",
        "Doolittle-0.1.0-mac-arm64.zip",
        "Doolittle-0.1.0-mac-arm64.zip.blockmap",
        "latest-mac.yml",
      ],
    });
    expect(releaseTargetReceipt(windows)).toEqual({
      platform: "windows",
      artifacts: [
        "Doolittle-0.1.0-win-x64.exe",
        "Doolittle-0.1.0-win-x64.exe.blockmap",
        "latest.yml",
      ],
    });
    expect(releaseTargetReceipt(linux)).toEqual({
      platform: "linux",
      artifacts: [
        "Doolittle-0.1.0-linux-x64.AppImage",
        "Doolittle-0.1.0-linux-x64.deb",
        "latest-linux.yml",
      ],
    });
  });

  it("removes superseded bundles without touching current or operator files", () => {
    const targets = releaseTargets("0.1.0", "arm64");
    expect(
      supersededReleaseOutputNames(
        [
          ".DS_Store",
          "Doolittle-0.1.0-mac-arm64.dmg",
          "Doolittle-0.1.0-win-x64.exe.blockmap",
          "Doolittle-2.0.3-beta.7-mac-arm64.dmg",
          "Doolittle-0.1.0-linux-arm64.AppImage",
          "latest-linux-arm64.yml",
          "linux-arm64-unpacked",
          "linux-unpacked",
          "mac-arm64",
          "Doolittle-operator-notes.txt",
          "operator-notes.txt",
        ],
        targets,
      ),
    ).toEqual([
      ".DS_Store",
      "Doolittle-2.0.3-beta.7-mac-arm64.dmg",
      "Doolittle-0.1.0-linux-arm64.AppImage",
      "latest-linux-arm64.yml",
      "linux-arm64-unpacked",
    ]);
  });

  it("preserves a directory package on failure and promotes it only after success", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-package-all-"));
    const release = join(root, "release");
    mkdirSync(release);
    const previousBundle = join(release, "Doolittle-0.0.9-mac-arm64.dmg");
    const previousAppAsar = join(
      release,
      "linux-x64-unpacked/resources/app.asar",
    );
    writeFileSync(previousBundle, "previous");
    mkdirSync(dirname(previousAppAsar), { recursive: true });
    writeFileSync(previousAppAsar, "previous package");
    writeFileSync(
      join(release, "Doolittle-operator-notes.txt"),
      "keep-prefixed",
    );
    writeFileSync(join(release, "operator-notes.txt"), "keep");

    try {
      await expect(
        withTransactionalReleaseDirectory(release, async (staging) => {
          const stagedAppAsar = join(
            staging,
            "linux-x64-unpacked/resources/app.asar",
          );
          mkdirSync(dirname(stagedAppAsar), { recursive: true });
          writeFileSync(stagedAppAsar, "partial package");
          throw new Error("build failed");
        }),
      ).rejects.toThrow("build failed");
      expect(readFileSync(previousBundle, "utf8")).toBe("previous");
      expect(readFileSync(previousAppAsar, "utf8")).toBe("previous package");

      await withTransactionalReleaseDirectory(release, async (staging) => {
        writeFileSync(join(staging, "Doolittle-current.dmg"), "current");
        const stagedAppAsar = join(
          staging,
          "linux-x64-unpacked/resources/app.asar",
        );
        mkdirSync(dirname(stagedAppAsar), { recursive: true });
        writeFileSync(stagedAppAsar, "current package");
      });
      expect(existsSync(previousBundle)).toBe(false);
      expect(readFileSync(join(release, "Doolittle-current.dmg"), "utf8")).toBe(
        "current",
      );
      expect(readFileSync(previousAppAsar, "utf8")).toBe("current package");
      expect(readFileSync(join(release, "operator-notes.txt"), "utf8")).toBe(
        "keep",
      );
      expect(
        readFileSync(join(release, "Doolittle-operator-notes.txt"), "utf8"),
      ).toBe("keep-prefixed");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("retains installers and operator files when replacing a directory package", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-package-dir-"));
    const release = join(root, "release");
    const previousAppAsar = join(
      release,
      "linux-x64-unpacked/resources/app.asar",
    );
    const installer = join(release, "Doolittle-0.1.0-mac-arm64.dmg");
    const receipt = join(release, "desktop-provenance-macos.json");
    const operatorFile = join(release, "operator-notes.txt");

    try {
      mkdirSync(dirname(previousAppAsar), { recursive: true });
      writeFileSync(previousAppAsar, "previous package");
      writeFileSync(installer, "installer");
      writeFileSync(receipt, "receipt");
      writeFileSync(operatorFile, "operator notes");

      await expect(
        withTransactionalReleaseDirectory(
          release,
          async (staging) => {
            rmSync(join(staging, "linux-x64-unpacked"), {
              force: true,
              recursive: true,
            });
            throw new Error("directory verification failed");
          },
          { seedCurrentEntries: true },
        ),
      ).rejects.toThrow("directory verification failed");
      expect(readFileSync(previousAppAsar, "utf8")).toBe("previous package");
      expect(readFileSync(installer, "utf8")).toBe("installer");
      expect(readFileSync(receipt, "utf8")).toBe("receipt");
      expect(readFileSync(operatorFile, "utf8")).toBe("operator notes");

      await withTransactionalReleaseDirectory(
        release,
        async (staging) => {
          const stagedAppAsar = join(
            staging,
            "linux-x64-unpacked/resources/app.asar",
          );
          rmSync(join(staging, "linux-x64-unpacked"), {
            force: true,
            recursive: true,
          });
          mkdirSync(dirname(stagedAppAsar), { recursive: true });
          writeFileSync(stagedAppAsar, "current package");
          writeFileSync(join(staging, "unpacked-manifest.json"), "manifest");
        },
        { seedCurrentEntries: true },
      );
      expect(readFileSync(previousAppAsar, "utf8")).toBe("current package");
      expect(readFileSync(installer, "utf8")).toBe("installer");
      expect(readFileSync(receipt, "utf8")).toBe("receipt");
      expect(readFileSync(operatorFile, "utf8")).toBe("operator notes");
      expect(
        readFileSync(join(release, "unpacked-manifest.json"), "utf8"),
      ).toBe("manifest");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rolls back a failed native package and replaces only its selected target on success", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-native-package-"));
    const release = join(root, "release");
    const macTarget = releaseTargets("0.1.0", "arm64")[0];
    if (!macTarget)
      throw new Error("macOS release target is required for test");
    const priorMacInstaller = join(release, macTarget.artifacts[0] ?? "");
    const priorLinuxInstaller = join(
      release,
      "Doolittle-0.1.0-linux-x64.AppImage",
    );
    const checksum = join(release, "SHA256SUMS.txt");
    const manifest = join(release, "release-manifest.json");
    const unpackedManifest = join(release, "unpacked-manifest.json");
    const linuxReceipt = join(release, "desktop-provenance-linux.json");
    const operatorFile = join(release, "operator-notes.txt");

    try {
      mkdirSync(release, { recursive: true });
      writeFileSync(priorMacInstaller, "previous mac installer");
      writeFileSync(priorLinuxInstaller, "linux installer");
      writeFileSync(checksum, "previous checksums");
      writeFileSync(manifest, "previous manifest");
      writeFileSync(unpackedManifest, "previous unpacked manifest");
      writeFileSync(linuxReceipt, "linux receipt");
      writeFileSync(operatorFile, "operator notes");

      await expect(
        withTransactionalNativePackage(release, macTarget, async (staging) => {
          writeFileSync(join(staging, macTarget.artifacts[0] ?? ""), "partial");
          throw new Error("native verification failed");
        }),
      ).rejects.toThrow("native verification failed");
      expect(readFileSync(priorMacInstaller, "utf8")).toBe(
        "previous mac installer",
      );
      expect(readFileSync(priorLinuxInstaller, "utf8")).toBe("linux installer");
      expect(readFileSync(checksum, "utf8")).toBe("previous checksums");
      expect(readFileSync(manifest, "utf8")).toBe("previous manifest");
      expect(readFileSync(unpackedManifest, "utf8")).toBe(
        "previous unpacked manifest",
      );
      expect(readFileSync(linuxReceipt, "utf8")).toBe("linux receipt");
      expect(readFileSync(operatorFile, "utf8")).toBe("operator notes");

      await withTransactionalNativePackage(
        release,
        macTarget,
        async (staging) => {
          const appAsar = join(
            staging,
            "mac-arm64/Doolittle.app/Contents/Resources/app.asar",
          );
          mkdirSync(dirname(appAsar), { recursive: true });
          writeFileSync(appAsar, "current package");
          for (const artifact of releaseTargetReceipt(macTarget).artifacts) {
            writeFileSync(join(staging, artifact), "current mac artifact");
          }
        },
      );
      expect(readFileSync(priorMacInstaller, "utf8")).toBe(
        "current mac artifact",
      );
      expect(readFileSync(priorLinuxInstaller, "utf8")).toBe("linux installer");
      expect(existsSync(checksum)).toBe(false);
      expect(existsSync(manifest)).toBe(false);
      expect(existsSync(unpackedManifest)).toBe(process.platform !== "darwin");
      expect(readFileSync(linuxReceipt, "utf8")).toBe("linux receipt");
      expect(readFileSync(operatorFile, "utf8")).toBe("operator notes");
      expect(
        readFileSync(
          join(release, "mac-arm64/Doolittle.app/Contents/Resources/app.asar"),
          "utf8",
        ),
      ).toBe("current package");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("supports darwin/arm64 packaging hosts", () => {
    expect(() =>
      validatePackageHost({
        platform: "darwin",
        arch: "arm64",
        checkWine: () => 0,
      }),
    ).not.toThrow();
  });

  it("fails clearly on darwin/x64 hosts", () => {
    expect(() =>
      validatePackageHost({
        platform: "darwin",
        arch: "x64",
        checkWine: () => 0,
      }),
    ).toThrow(
      "requires an Apple Silicon macOS host. Current host is darwin-x64",
    );
  });

  it("fails clearly on non-darwin hosts", () => {
    expect(() =>
      validatePackageHost({
        platform: "linux",
        arch: "x64",
        checkWine: () => 0,
      }),
    ).toThrow("supported only on macOS arm64 hosts");
  });

  it("fails clearly when Wine is missing", () => {
    expect(() =>
      validatePackageHost({
        platform: "darwin",
        arch: "arm64",
        checkWine: () => 127,
      }),
    ).toThrow("Windows cross-packaging requires Wine");
  });

  it("requires a clean source tree and a stable commit for packaging", () => {
    const cleanGit = vi.fn((args: string[]) =>
      args[0] === "rev-parse"
        ? { status: 0, stdout: "commit-a\n" }
        : { status: 0, stdout: "" },
    );
    expect(requireCleanPackageSource("/repo", cleanGit)).toBe("commit-a");
    expect(() =>
      assertPackageSourceUnchanged("/repo", "commit-a", cleanGit),
    ).not.toThrow();

    const dirtyGit = vi.fn((args: string[]) =>
      args[0] === "rev-parse"
        ? { status: 0, stdout: "commit-a\n" }
        : { status: 0, stdout: " M apps/desktop/src/main/index.ts\n" },
    );
    expect(() => requireCleanPackageSource("/repo", dirtyGit)).toThrow(
      "must be built from a clean worktree",
    );

    const changedCommitGit = vi.fn((args: string[]) =>
      args[0] === "rev-parse"
        ? { status: 0, stdout: "commit-b\n" }
        : { status: 0, stdout: "" },
    );
    expect(() =>
      assertPackageSourceUnchanged("/repo", "commit-a", changedCommitGit),
    ).toThrow("Package source changed during the build");
  });
});
