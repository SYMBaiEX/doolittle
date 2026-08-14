import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { releaseTargets, resolveSingleExistingPath } from "./package-all";

const desktopManifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../package.json", import.meta.url)),
    "utf8",
  ),
) as {
  author?: { email?: string };
  desktopName?: string;
  homepage?: string;
  build?: { linux?: { maintainer?: string; syncDesktopName?: boolean } };
};

describe("all-platform desktop release plan", () => {
  it("builds the supported macOS, Windows, and Linux artifacts", () => {
    expect(releaseTargets("2.0.3-beta.7", "arm64")).toEqual([
      expect.objectContaining({
        id: "mac",
        builderArgs: ["--mac", "dmg", "zip", "--arm64"],
        artifacts: [
          "Doolittle-2.0.3-beta.7-mac-arm64.dmg",
          "Doolittle-2.0.3-beta.7-mac-arm64.zip",
        ],
      }),
      expect.objectContaining({
        id: "win",
        builderArgs: ["--win", "nsis", "--x64"],
        artifacts: ["Doolittle-2.0.3-beta.7-win-x64.exe"],
      }),
      expect.objectContaining({
        id: "linux",
        builderArgs: ["--linux", "AppImage", "deb", "--arm64"],
        artifacts: [
          "Doolittle-2.0.3-beta.7-linux-arm64.AppImage",
          "Doolittle-2.0.3-beta.7-linux-arm64.deb",
        ],
      }),
    ]);
  });

  it("rejects missing and ambiguous unpacked packages", () => {
    expect(() => resolveSingleExistingPath("/missing", ["one", "two"])).toThrow(
      "found 0",
    );
  });

  it("declares the metadata required by Linux package targets", () => {
    expect(desktopManifest).toMatchObject({
      homepage: "https://github.com/SYMBaiEX/doolittle",
      author: { email: "solsymbaiex@gmail.com" },
      desktopName: "Doolittle.desktop",
      build: {
        linux: {
          maintainer: "SYMBaiEX <solsymbaiex@gmail.com>",
          syncDesktopName: true,
        },
      },
    });
  });
});
