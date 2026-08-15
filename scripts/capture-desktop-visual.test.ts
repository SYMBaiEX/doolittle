import { describe, expect, it } from "vitest";
import {
  legacyVisualEvidencePaths,
  selectVisualSweepExecutable,
  visualSweepCandidates,
} from "./capture-desktop-visual";

describe("desktop visual sweep launcher", () => {
  it("prefers the installed macOS app and retains the packaged fallback", () => {
    expect(visualSweepCandidates("darwin", "/repo")).toEqual([
      "/Applications/Doolittle.app/Contents/MacOS/Doolittle",
      "/repo/apps/desktop/release/mac-arm64/Doolittle.app/Contents/MacOS/Doolittle",
    ]);
  });

  it("uses target-native unpacked executables on Windows and Linux", () => {
    expect(visualSweepCandidates("win32", "/repo")).toEqual([
      "/repo/apps/desktop/release/win-unpacked/Doolittle.exe",
    ]);
    expect(visualSweepCandidates("linux", "/repo")).toEqual([
      "/repo/apps/desktop/release/linux-unpacked/Doolittle",
    ]);
  });

  it("selects the first available executable", () => {
    expect(
      selectVisualSweepExecutable(
        ["installed", "packaged"],
        (path) => path === "packaged",
      ),
    ).toBe("packaged");
    expect(selectVisualSweepExecutable(["missing"], () => false)).toBeNull();
  });

  it("cleans only known legacy root images from prior evidence", () => {
    expect(
      legacyVisualEvidencePaths(
        "/evidence",
        JSON.stringify({
          routes: [
            { route: "chat" },
            { route: "review" },
            { route: "../outside" },
          ],
        }),
      ),
    ).toEqual([
      "/evidence/contact-desktop.png",
      "/evidence/contact-narrow.png",
      "/evidence/chat.png",
      "/evidence/review.png",
    ]);
    expect(legacyVisualEvidencePaths("/evidence", "not-json")).toEqual([
      "/evidence/contact-desktop.png",
      "/evidence/contact-narrow.png",
    ]);
  });
});
