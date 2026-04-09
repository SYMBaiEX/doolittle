import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPixelScreenshotPng, createScreenshotSvg } from "./capture-cards";
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
  writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        ...page,
        notes,
      },
      null,
      2,
    ),
    "utf8",
  );

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
  captureMode: "pixel" | "placeholder";
} {
  const basePath = join(outputDir, `screenshot-${Date.now()}`);
  const markdownPath = `${basePath}.md`;
  const jsonPath = `${basePath}.json`;
  const svgPath = `${basePath}.svg`;
  const captureMode = page.mode === "browser" ? "pixel" : "placeholder";
  const screenshotPath =
    captureMode === "pixel" ? `${basePath}.png` : markdownPath;

  if (captureMode === "pixel") {
    writeFileSync(screenshotPath, createPixelScreenshotPng(page));
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
        `Hash: ${page.contentHash}`,
        "",
        "This is a lightweight pixel-backed browser capture card generated from the browser-rendered page snapshot.",
        "It is not a full DOM screenshot, but it is a real raster artifact instead of a markdown placeholder.",
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

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        ...page,
        notes,
        captureMode,
        screenshotPath,
        markdownPath,
      },
      null,
      2,
    ),
    "utf8",
  );
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
