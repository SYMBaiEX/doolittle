import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import { createCaptureCardPng, createScreenshotSvg } from "./capture-cards";
import type { WebPageSnapshot } from "./service-types";

export function writeArtifact(
  outputDir: string,
  prefix: "snapshot" | "screenshot",
  page: WebPageSnapshot,
  notes: string[],
): { markdownPath: string; jsonPath: string; svgPath?: string } {
  const filePath = join(outputDir, `${prefix}-${Date.now()}.md`);
  const content = [
    `# ${prefix === "screenshot" ? "Browser Screenshot" : (page.title ?? page.url)}`,
    "",
    `Source: ${page.url}`,
    `Provider: ${page.provider}`,
    `Mode: ${page.mode}`,
    `Rendered at: ${page.renderedAt}`,
    `Content type: ${page.contentType}`,
    `Content length: ${page.contentLength}`,
    `Words: ${page.wordCount}`,
    `Lines: ${page.lineCount}`,
    `Links: ${page.linkCount}`,
    `Images: ${page.imageCount}`,
    `Headings: ${page.headingCount}`,
    `Hash: ${page.contentHash}`,
  ];

  if (page.metaDescription) {
    content.push(`Description: ${page.metaDescription}`);
  }

  if (page.canonicalUrl) {
    content.push(`Canonical: ${page.canonicalUrl}`);
  }

  content.push("", ...notes, "", page.text);

  writeFileSync(filePath, content.join("\n"), "utf8");

  const metadataPath = filePath.replace(/\.md$/u, ".json");
  writeJsonAtomicSync(metadataPath, {
    ...page,
    notes,
  });

  const svgPath =
    prefix === "screenshot" ? filePath.replace(/\.md$/u, ".svg") : undefined;
  if (svgPath) {
    writeFileSync(svgPath, createScreenshotSvg(page, notes), "utf8");
  }
  return { markdownPath: filePath, jsonPath: metadataPath, svgPath };
}

export function writeScreenshotArtifact(
  outputDir: string,
  page: WebPageSnapshot,
  notes: string[],
): {
  screenshotPath: string;
  markdownPath: string;
  jsonPath: string;
  svgPath: string;
  captureMode: "capture-card" | "placeholder";
} {
  const basePath = join(outputDir, `screenshot-${Date.now()}`);
  const markdownPath = `${basePath}.md`;
  const jsonPath = `${basePath}.json`;
  const svgPath = `${basePath}.svg`;
  const captureMode = page.mode === "browser" ? "capture-card" : "placeholder";
  const screenshotPath =
    captureMode === "capture-card" ? `${basePath}.png` : markdownPath;

  if (captureMode === "capture-card") {
    writeFileSync(screenshotPath, createCaptureCardPng(page));
    writeFileSync(
      markdownPath,
      [
        "# Browser Capture Card",
        "",
        `Source: ${page.url}`,
        `Provider: ${page.provider}`,
        `Mode: ${page.mode}`,
        `Capture mode: ${captureMode}`,
        `Rendered at: ${page.renderedAt}`,
        `Content type: ${page.contentType}`,
        `Hash: ${page.contentHash}`,
        "",
        "This PNG is a text-based capture card generated from the fetched page snapshot, not a screenshot of the rendered page.",
        "It cannot verify layout, color, contrast, spacing or other pixel-level visual claims.",
        "",
        ...notes,
      ].join("\n"),
      "utf8",
    );
  } else {
    writeFileSync(
      markdownPath,
      [
        "# Browser Screenshot",
        "",
        `Source: ${page.url}`,
        `Provider: ${page.provider}`,
        `Mode: ${page.mode}`,
        `Capture mode: ${captureMode}`,
        `Rendered at: ${page.renderedAt}`,
        `Content type: ${page.contentType}`,
        `Content length: ${page.contentLength}`,
        `Words: ${page.wordCount}`,
        `Lines: ${page.lineCount}`,
        `Links: ${page.linkCount}`,
        `Images: ${page.imageCount}`,
        `Headings: ${page.headingCount}`,
        `Hash: ${page.contentHash}`,
        ...(page.metaDescription
          ? [`Description: ${page.metaDescription}`]
          : []),
        ...(page.canonicalUrl ? [`Canonical: ${page.canonicalUrl}`] : []),
        "",
        ...notes,
        "",
        page.text,
      ].join("\n"),
      "utf8",
    );
  }

  writeJsonAtomicSync(jsonPath, {
    ...page,
    notes,
    captureMode,
    screenshotPath,
    markdownPath,
  });
  writeFileSync(svgPath, createScreenshotSvg(page, notes), "utf8");

  return {
    screenshotPath,
    markdownPath,
    jsonPath,
    svgPath,
    captureMode,
  };
}

export function slugifyUrl(url: string): string {
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

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
