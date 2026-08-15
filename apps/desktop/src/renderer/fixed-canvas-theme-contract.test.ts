import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BROWSER_CODE_PREVIEW_CLASS,
  BROWSER_FIELD_CONTROL_CLASS,
  BROWSER_FRAME_STAGE_CLASS,
} from "./browser/browser-layout";
import {
  ARTIFACT_IMAGE_CANVAS_CLASS,
  ARTIFACT_TEXT_CANVAS_CLASS,
} from "./components/ArtifactViewer";
import { BROWSER_RESULT_IMAGE_CANVAS_CLASS } from "./components/BrowserResultPanel";
import {
  REVIEW_COMMAND_CLASS,
  REVIEW_COMMENT_EDITOR_CLASS,
  REVIEW_PATCH_CLASS,
  reviewPatchLineClass,
} from "./review/layout";

const themeSource = readFileSync(
  new URL("./desktop-theme.ts", import.meta.url),
  "utf8",
);

function fixedHexToken(name: string): string {
  const matches = Array.from(
    themeSource.matchAll(
      new RegExp(`"${name}"\\s*:\\s*"(#[0-9a-f]{6})"`, "giu"),
    ),
  );
  expect(matches, `${name} must be defined exactly once`).toHaveLength(1);
  return matches[0]?.[1] ?? "#000000";
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (channels?.length !== 3) return 0;
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("fixed canvas theme contract", () => {
  it("keeps readable canvas foregrounds independent from appearance", () => {
    const background = fixedHexToken("--canvas-bg");
    const primary = fixedHexToken("--canvas-text");
    const secondary = fixedHexToken("--canvas-text-soft");
    fixedHexToken("--canvas-border");

    expect(contrastRatio(primary, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(secondary, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses fixed foregrounds on review, browser, and artifact canvases", () => {
    for (const className of [
      REVIEW_COMMAND_CLASS,
      REVIEW_PATCH_CLASS,
      BROWSER_CODE_PREVIEW_CLASS,
      ARTIFACT_TEXT_CANVAS_CLASS,
    ]) {
      expect(className).toContain("var(--canvas-bg)");
      expect(className).toMatch(/var\(--canvas-text(?:-soft)?\)/u);
    }

    for (const kind of ["addition", "deletion", "hunk", "meta", "context"]) {
      expect(reviewPatchLineClass(kind)).toMatch(
        /text-\[var\(--canvas-text(?:-soft)?\)\]/u,
      );
    }
    expect(reviewPatchLineClass("context")).toContain(
      "[&>button]:text-[var(--canvas-text)]",
    );
  });

  it("uses fixed framing for preview and image canvases", () => {
    expect(BROWSER_FRAME_STAGE_CLASS).toContain("bg-[var(--canvas-bg)]");
    expect(BROWSER_FRAME_STAGE_CLASS).toContain("var(--canvas-border)");
    for (const className of [
      ARTIFACT_IMAGE_CANVAS_CLASS,
      BROWSER_RESULT_IMAGE_CANVAS_CLASS,
    ]) {
      expect(className).toContain("bg-[var(--canvas-bg)]");
      expect(className).toContain("border-[var(--canvas-border)]");
    }
  });

  it("keeps forms and comment chrome appearance-aware", () => {
    expect(BROWSER_FIELD_CONTROL_CLASS).toContain("bg-[var(--surface-raised)]");
    expect(BROWSER_FIELD_CONTROL_CLASS).toContain("text-[var(--text)]");
    expect(BROWSER_FIELD_CONTROL_CLASS).not.toContain("--canvas-");
    expect(REVIEW_COMMENT_EDITOR_CLASS).toContain("bg-[var(--surface-raised)]");
    expect(REVIEW_COMMENT_EDITOR_CLASS).not.toContain("--canvas-");
  });

  it("removes the legacy hard-coded dark surfaces from owned routes", () => {
    const ownedSources = [
      "./browser/browser-layout.ts",
      "./components/ArtifactViewer.tsx",
      "./components/BrowserResultPanel.tsx",
      "./review/layout.ts",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

    expect(ownedSources.join("\n")).not.toMatch(
      /bg-\[#(?:080706|0a0908|100e0c)\]/u,
    );
  });
});
