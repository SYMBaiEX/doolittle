import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  allPlatformInstallArgs,
  missingNativeTargetPackages,
  releaseTargets,
  requiredNativeTargetPackages,
  resolveSingleExistingPath,
} from "./package-all";

const desktopManifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../package.json", import.meta.url)),
    "utf8",
  ),
) as {
  author?: { email?: string };
  desktopName?: string;
  homepage?: string;
  build?: {
    extraResources?: Array<{ from?: string; to?: string }>;
    linux?: {
      artifactName?: string;
      maintainer?: string;
      syncDesktopName?: boolean;
    };
  };
};

describe("all-platform desktop release plan", () => {
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
});
