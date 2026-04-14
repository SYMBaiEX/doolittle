import type {
  BrowserComparisonBundle,
  WebPageSnapshot,
} from "../service-types";

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
