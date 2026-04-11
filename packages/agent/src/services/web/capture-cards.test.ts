import { describe, expect, it } from "bun:test";
import { createPixelScreenshotPng, createScreenshotSvg } from "./capture-cards";

const page = {
  url: "https://example.com",
  title: "Example <Page>",
  metaDescription: "Testing & validation",
  text: "A compact browser capture preview for test coverage.",
  provider: "lightpanda" as const,
  mode: "browser" as const,
  contentType: "text/html",
  wordCount: 8,
  linkCount: 2,
  imageCount: 1,
  contentHash: "0123456789abcdef",
};

describe("web-service capture cards", () => {
  it("renders a browser capture SVG with escaped content", () => {
    const svg = createScreenshotSvg(page, ['Use <unsafe> & "quoted" notes']);

    expect(svg).toContain("Doolittle Browser Capture");
    expect(svg).toContain("Example &lt;Page&gt;");
    expect(svg).toContain("Testing &amp; validation");
    expect(svg).toContain("Use &lt;unsafe&gt; &amp; &quot;quoted&quot; notes");
  });

  it("renders a deterministic PNG capture card", () => {
    const screenshot = createPixelScreenshotPng(page);

    expect(screenshot.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(screenshot.length).toBeGreaterThan(500);
  });
});
