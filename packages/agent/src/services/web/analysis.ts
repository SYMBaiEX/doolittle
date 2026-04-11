import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  BrowserAnalysisBundle,
  BrowserAnalysisFocus,
  BrowserCaptureBundle,
  BrowserComparisonAnalysisBundle,
  BrowserComparisonBundle,
  WebPageSnapshot,
} from "./service-types";

function slugifyUrl(url: string): string {
  return (
    url
      .replace(/^https?:\/\//u, "")
      .replace(/^data:/u, "data-")
      .replace(/[^a-z0-9]+/giu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 72)
      .toLowerCase() || "capture"
  );
}

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

export function buildWebHighlights(page: WebPageSnapshot): string[] {
  return [
    page.title ? `Title: ${page.title}` : undefined,
    page.metaDescription ? `Description: ${page.metaDescription}` : undefined,
    page.canonicalUrl ? `Canonical: ${page.canonicalUrl}` : undefined,
    `Provider: ${page.provider}/${page.mode}`,
    `Content: ${page.contentType}`,
    `Words: ${page.wordCount}`,
    `Links: ${page.linkCount}`,
    `Images: ${page.imageCount}`,
    `Headings: ${page.headingCount}`,
  ].filter(Boolean) as string[];
}

export function buildWebAnalysisPrompt(
  capture: BrowserCaptureBundle,
  focus: BrowserAnalysisFocus,
): string {
  const page = capture.page;
  const intent =
    focus === "vision"
      ? "vision-style analysis"
      : focus === "research"
        ? "research analysis"
        : "browser analysis";

  return [
    `You are reviewing a browser capture for Doolittle and should provide concise, actionable ${intent}.`,
    `Focus on layout, hierarchy, important content, likely user intent, and any risks or missing details.`,
    `Keep the response short and structured: summary, signals, recommendations.`,
    "",
    `URL: ${page.url}`,
    `Title: ${page.title ?? "n/a"}`,
    `Description: ${page.metaDescription ?? "n/a"}`,
    `Canonical: ${page.canonicalUrl ?? "n/a"}`,
    `Provider: ${page.provider}`,
    `Mode: ${page.mode}`,
    `Content type: ${page.contentType}`,
    `Words: ${page.wordCount}`,
    `Links: ${page.linkCount}`,
    `Images: ${page.imageCount}`,
    `Headings: ${page.headingCount}`,
    `Content hash: ${page.contentHash}`,
    "",
    "Artifacts:",
    `- Snapshot: ${capture.snapshotPath}`,
    `- Screenshot: ${capture.screenshotPath}`,
    `- Screenshot SVG: ${capture.screenshotSvgPath}`,
    `- Manifest: ${capture.manifestPath}`,
    `- Report: ${capture.reportPath}`,
    "",
    "Readable text preview:",
    page.text.slice(0, 2400) || "(empty)",
  ].join("\n");
}

export function buildWebComparisonHighlights(
  comparison: BrowserComparisonBundle,
): string[] {
  return [
    `Left title: ${comparison.left.page.title ?? "n/a"}`,
    `Right title: ${comparison.right.page.title ?? "n/a"}`,
    `Title changed: ${comparison.summary.titleChanged}`,
    `Hash changed: ${comparison.summary.hashChanged}`,
    `Word delta: ${comparison.summary.wordDelta}`,
    `Link delta: ${comparison.summary.linkDelta}`,
    `Image delta: ${comparison.summary.imageDelta}`,
    `Heading delta: ${comparison.summary.headingDelta}`,
  ];
}

export function buildWebComparisonPrompt(
  comparison: BrowserComparisonBundle,
  focus: BrowserAnalysisFocus,
): string {
  const intent =
    focus === "vision"
      ? "vision-style comparison"
      : focus === "research"
        ? "research comparison"
        : "browser comparison";

  return [
    `You are comparing two browser captures for Doolittle and should provide concise, actionable ${intent}.`,
    `Highlight visual or semantic changes, likely user-facing impact, and any regression risks.`,
    `Keep the response short and structured: summary, change list, recommendations.`,
    "",
    `Left URL: ${comparison.left.page.url}`,
    `Right URL: ${comparison.right.page.url}`,
    `Left title: ${comparison.left.page.title ?? "n/a"}`,
    `Right title: ${comparison.right.page.title ?? "n/a"}`,
    `Left hash: ${comparison.left.page.contentHash}`,
    `Right hash: ${comparison.right.page.contentHash}`,
    `Title changed: ${comparison.summary.titleChanged}`,
    `Hash changed: ${comparison.summary.hashChanged}`,
    `Word delta: ${comparison.summary.wordDelta}`,
    `Link delta: ${comparison.summary.linkDelta}`,
    `Image delta: ${comparison.summary.imageDelta}`,
    `Heading delta: ${comparison.summary.headingDelta}`,
    "",
    "Artifacts:",
    `- Left snapshot: ${comparison.left.snapshotPath}`,
    `- Right snapshot: ${comparison.right.snapshotPath}`,
    `- Comparison report: ${comparison.reportPath}`,
    `- Comparison manifest: ${comparison.manifestPath}`,
    "",
    "Left preview:",
    (comparison.left.page.metaDescription ??
      comparison.left.page.text.slice(0, 1200)) ||
      "(empty)",
    "",
    "Right preview:",
    (comparison.right.page.metaDescription ??
      comparison.right.page.text.slice(0, 1200)) ||
      "(empty)",
  ].join("\n");
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
