import type {
  BrowserAnalysisFocus,
  BrowserCaptureBundle,
  BrowserComparisonBundle,
} from "../service-types";

function describeAnalysisIntent(
  focus: BrowserAnalysisFocus,
  subject: "analysis" | "comparison",
): string {
  if (focus === "vision") {
    return `vision-style ${subject}`;
  }

  if (focus === "research") {
    return `research ${subject}`;
  }

  return `browser ${subject}`;
}

export function buildWebAnalysisPrompt(
  capture: BrowserCaptureBundle,
  focus: BrowserAnalysisFocus,
): string {
  const page = capture.page;

  return [
    `You are reviewing a browser capture for Doolittle and should provide concise, actionable ${describeAnalysisIntent(focus, "analysis")}.`,
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

export function buildWebComparisonPrompt(
  comparison: BrowserComparisonBundle,
  focus: BrowserAnalysisFocus,
): string {
  return [
    `You are comparing two browser captures for Doolittle and should provide concise, actionable ${describeAnalysisIntent(focus, "comparison")}.`,
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
