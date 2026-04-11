import { describe, expect, it } from "bun:test";
import { buildPageMetrics, extractReadableText } from "./content";

describe("web-service content helpers", () => {
  it("extracts html metadata and readable text", () => {
    const extracted = extractReadableText(
      "<html><head><title>Alpha</title><meta name='description' content='Summary'><link rel='canonical' href='https://example.com/a'></head><body><h1>Hello</h1><p>World</p></body></html>",
    );

    expect(extracted.title).toBe("Alpha");
    expect(extracted.metaDescription).toBe("Summary");
    expect(extracted.canonicalUrl).toBe("https://example.com/a");
    expect(extracted.text).toContain("Hello");
    expect(extracted.text).toContain("\n");
  });

  it("builds page metrics from structured content", () => {
    const metrics = buildPageMetrics(
      "<html><body><h1>Title</h1><p>One two</p><a href='/a'>a</a><img src='a.png'></body></html>",
      "Title\nOne two",
      "text/html",
    );

    expect(metrics.wordCount).toBe(3);
    expect(metrics.lineCount).toBe(2);
    expect(metrics.linkCount).toBe(1);
    expect(metrics.imageCount).toBe(1);
    expect(metrics.headingCount).toBe(1);
    expect(metrics.contentLength).toBeGreaterThan(0);
    expect(metrics.contentHash).toBeTruthy();
  });
});
