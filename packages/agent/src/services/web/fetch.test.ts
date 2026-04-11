import { describe, expect, it } from "bun:test";
import { buildPageMetrics, extractReadableText } from "./content";

describe("web-service fetch helpers", () => {
  it("extracts readable text and metadata from html", () => {
    const readable = extractReadableText(
      "<html><head><title>Meta</title><meta name='description' content='Desc'><link rel='canonical' href='https://example.com'></head><body><h1>Hello</h1><p>World</p></body></html>",
    );

    expect(readable.title).toBe("Meta");
    expect(readable.metaDescription).toBe("Desc");
    expect(readable.canonicalUrl).toBe("https://example.com");
    expect(readable.text).toContain("Hello");
    expect(readable.text).toContain("World");
  });

  it("builds stable metrics from markup", () => {
    const metrics = buildPageMetrics(
      "<html><body><h1>Alpha</h1><p>Beta</p><a href='/x'>Link</a><img src='y'></body></html>",
      "Alpha\nBeta\nLink",
      "text/html",
    );

    expect(metrics.wordCount).toBe(3);
    expect(metrics.linkCount).toBe(1);
    expect(metrics.imageCount).toBe(1);
    expect(metrics.headingCount).toBe(1);
    expect(metrics.contentLength).toBeGreaterThan(0);
    expect(metrics.contentHash.length).toBeGreaterThan(0);
  });
});
