import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { slugifyUrl } from "../artifacts";
import type {
  BrowserAnalysisBundle,
  BrowserAnalysisFocus,
  BrowserCaptureBundle,
  BrowserComparisonAnalysisBundle,
  BrowserComparisonBundle,
  WebPageSnapshot,
} from "../service-types";
import { buildWebComparisonHighlights, buildWebHighlights } from "./formatting";
import { buildWebAnalysisPrompt, buildWebComparisonPrompt } from "./prompts";

export function compareSnapshotMetrics(
  left: WebPageSnapshot,
  right: WebPageSnapshot,
) {
  return {
    titleChanged: left.title !== right.title,
    hashChanged: left.contentHash !== right.contentHash,
    wordDelta: right.wordCount - left.wordCount,
    linkDelta: right.linkCount - left.linkCount,
    imageDelta: right.imageCount - left.imageCount,
    headingDelta: right.headingCount - left.headingCount,
  };
}

export function createWebAnalysisBundle(
  capture: BrowserCaptureBundle,
  focus: BrowserAnalysisFocus,
): BrowserAnalysisBundle {
  return {
    focus,
    capture,
    prompt: buildWebAnalysisPrompt(capture, focus),
    highlights: buildWebHighlights(capture.page),
  };
}

export function createWebComparisonBundle(input: {
  outputDir: string;
  leftUrl: string;
  rightUrl: string;
  left: BrowserCaptureBundle;
  right: BrowserCaptureBundle;
}): BrowserComparisonBundle {
  const { outputDir, leftUrl, rightUrl, left, right } = input;
  const stamp = Date.now();
  const slug = `${slugifyUrl(leftUrl)}-vs-${slugifyUrl(rightUrl)}`;
  const manifestPath = join(outputDir, `comparison-${stamp}-${slug}.json`);
  const reportPath = join(outputDir, `comparison-${stamp}-${slug}.md`);
  const summary = compareSnapshotMetrics(left.page, right.page);

  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        left: {
          url: left.page.url,
          manifestPath: left.manifestPath,
          reportPath: left.reportPath,
          snapshotPath: left.snapshotPath,
          screenshotPath: left.screenshotPath,
          screenshotSvgPath: left.screenshotSvgPath,
        },
        right: {
          url: right.page.url,
          manifestPath: right.manifestPath,
          reportPath: right.reportPath,
          snapshotPath: right.snapshotPath,
          screenshotPath: right.screenshotPath,
          screenshotSvgPath: right.screenshotSvgPath,
        },
        summary,
      },
      null,
      2,
    ),
    "utf8",
  );

  writeFileSync(
    reportPath,
    [
      `# Browser Comparison Bundle`,
      "",
      `Left: ${left.page.url}`,
      `Right: ${right.page.url}`,
      `Left title: ${left.page.title ?? "n/a"}`,
      `Right title: ${right.page.title ?? "n/a"}`,
      `Left hash: ${left.page.contentHash}`,
      `Right hash: ${right.page.contentHash}`,
      `Title changed: ${summary.titleChanged}`,
      `Hash changed: ${summary.hashChanged}`,
      `Word delta: ${summary.wordDelta}`,
      `Link delta: ${summary.linkDelta}`,
      `Image delta: ${summary.imageDelta}`,
      `Heading delta: ${summary.headingDelta}`,
      "",
      "## Artifacts",
      `- Left snapshot: ${left.snapshotPath}`,
      `- Left screenshot: ${left.screenshotPath}`,
      `- Left manifest: ${left.manifestPath}`,
      `- Right snapshot: ${right.snapshotPath}`,
      `- Right screenshot: ${right.screenshotPath}`,
      `- Right manifest: ${right.manifestPath}`,
      `- Comparison manifest: ${manifestPath}`,
      "",
      "## Left Preview",
      (left.page.metaDescription ?? left.page.text.slice(0, 900)) || "(empty)",
      "",
      "## Right Preview",
      (right.page.metaDescription ?? right.page.text.slice(0, 900)) ||
        "(empty)",
    ].join("\n"),
    "utf8",
  );

  return {
    left,
    right,
    manifestPath,
    reportPath,
    summary,
  };
}

export function createWebComparisonAnalysisBundle(
  comparison: BrowserComparisonBundle,
  focus: BrowserAnalysisFocus,
): BrowserComparisonAnalysisBundle {
  return {
    focus,
    comparison,
    prompt: buildWebComparisonPrompt(comparison, focus),
    highlights: buildWebComparisonHighlights(comparison),
  };
}
