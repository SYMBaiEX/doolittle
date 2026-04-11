import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWebComparisonBundle } from "./analysis";
import { slugifyUrl } from "./artifacts";
import type {
  BrowserCaptureBundle,
  BrowserComparisonBundle,
  BrowserInspection,
} from "./service-types";

export function createCaptureReadModel(
  outputDir: string,
  url: string,
  inspection: BrowserInspection,
): BrowserCaptureBundle {
  const stamp = Date.now();
  const slug = slugifyUrl(url);
  const manifestPath = join(outputDir, `capture-${stamp}-${slug}.json`);
  const reportPath = join(outputDir, `capture-${stamp}-${slug}.md`);

  const manifest = {
    url,
    createdAt: new Date().toISOString(),
    page: inspection.page,
    artifacts: {
      snapshotPath: inspection.snapshotPath,
      screenshotPath: inspection.screenshotPath,
      screenshotSvgPath: inspection.screenshotSvgPath,
      captureMode: inspection.captureMode,
    },
    status: inspection.status,
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  writeFileSync(
    reportPath,
    [
      `# Browser Capture Bundle`,
      "",
      `URL: ${inspection.page.url}`,
      `Title: ${inspection.page.title ?? "n/a"}`,
      `Provider: ${inspection.page.provider}`,
      `Mode: ${inspection.page.mode}`,
      `Capture mode: ${inspection.captureMode}`,
      `Rendered at: ${inspection.page.renderedAt}`,
      `Words: ${inspection.page.wordCount}`,
      `Lines: ${inspection.page.lineCount}`,
      `Links: ${inspection.page.linkCount}`,
      `Images: ${inspection.page.imageCount}`,
      `Headings: ${inspection.page.headingCount}`,
      `Hash: ${inspection.page.contentHash}`,
      "",
      "## Artifacts",
      `- Snapshot: ${inspection.snapshotPath}`,
      `- Screenshot: ${inspection.screenshotPath}`,
      `- Screenshot SVG: ${inspection.screenshotSvgPath}`,
      `- Manifest: ${manifestPath}`,
      "",
      "## Preview",
      (inspection.page.metaDescription ??
        inspection.page.text.slice(0, 1200)) ||
        "(empty)",
    ].join("\n"),
    "utf8",
  );

  return {
    ...inspection,
    manifestPath,
    reportPath,
  };
}

export function createComparisonReadModel(input: {
  outputDir: string;
  leftUrl: string;
  rightUrl: string;
  left: BrowserCaptureBundle;
  right: BrowserCaptureBundle;
}): BrowserComparisonBundle {
  const { outputDir, leftUrl, rightUrl, left, right } = input;
  return createWebComparisonBundle({
    outputDir,
    leftUrl,
    rightUrl,
    left,
    right,
  });
}
