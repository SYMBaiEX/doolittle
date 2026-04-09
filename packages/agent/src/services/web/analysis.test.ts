import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildWebAnalysisPrompt,
  buildWebComparisonHighlights,
  buildWebComparisonPrompt,
  buildWebHighlights,
  compareSnapshotMetrics,
  createWebComparisonBundle,
} from "./analysis";
import type {
  BrowserCaptureBundle,
  BrowserComparisonBundle,
  BrowserStatus,
  WebPageSnapshot,
} from "./service-types";

function makePage(overrides: Partial<WebPageSnapshot> = {}): WebPageSnapshot {
  return {
    url: "https://example.com",
    title: "Example",
    metaDescription: "Example summary",
    canonicalUrl: "https://example.com",
    text: "Alpha Beta Gamma Delta",
    contentType: "text/html",
    provider: "basic",
    mode: "fallback",
    renderedAt: "2026-03-30T00:00:00.000Z",
    contentHash: "abc123",
    contentLength: 42,
    wordCount: 4,
    lineCount: 1,
    linkCount: 2,
    imageCount: 1,
    headingCount: 1,
    ...overrides,
  };
}

function makeStatus(): BrowserStatus {
  return {
    provider: "basic",
    ready: true,
    mode: "fallback",
    detail: "Basic mode",
    artifacts: {
      snapshot: true,
      screenshot: true,
      comparison: true,
    },
    captureMode: "placeholder",
    captureReady: false,
  };
}

function makeCapture(
  url: string,
  pageOverrides: Partial<WebPageSnapshot> = {},
): BrowserCaptureBundle {
  return {
    page: makePage({ url, ...pageOverrides }),
    snapshotPath: "/tmp/snapshot.md",
    screenshotPath: "/tmp/screenshot.md",
    screenshotSvgPath: "/tmp/screenshot.svg",
    manifestPath: "/tmp/capture.json",
    reportPath: "/tmp/capture.md",
    captureMode: "placeholder",
    status: makeStatus(),
  };
}

describe("web-service analysis helpers", () => {
  it("builds analysis and comparison prompts from capture bundles", () => {
    const left = makeCapture("https://example.com/left");
    const right = makeCapture("https://example.com/right", {
      title: "Right",
      contentHash: "xyz789",
      wordCount: 7,
      linkCount: 3,
      imageCount: 2,
      headingCount: 2,
    });
    const comparison: BrowserComparisonBundle = {
      left,
      right,
      manifestPath: "/tmp/comparison.json",
      reportPath: "/tmp/comparison.md",
      summary: compareSnapshotMetrics(left.page, right.page),
    };

    expect(buildWebHighlights(left.page)).toContain("Title: Example");
    expect(buildWebAnalysisPrompt(left, "vision")).toContain(
      "vision-style analysis",
    );
    expect(buildWebComparisonHighlights(comparison)).toContain(
      "Title changed: true",
    );
    expect(buildWebComparisonPrompt(comparison, "research")).toContain(
      "research comparison",
    );
  });

  it("writes comparison artifacts through the extracted helper", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-web-analysis-"));
    const left = makeCapture("https://example.com/left");
    const right = makeCapture("https://example.com/right", {
      title: "Right",
      contentHash: "xyz789",
      wordCount: 7,
      linkCount: 3,
      imageCount: 2,
      headingCount: 2,
    });

    try {
      const comparison = createWebComparisonBundle({
        outputDir: root,
        leftUrl: left.page.url,
        rightUrl: right.page.url,
        left,
        right,
      });

      expect(comparison.summary.hashChanged).toBe(true);
      expect(comparison.summary.wordDelta).toBe(3);
      expect(readFileSync(comparison.reportPath, "utf8")).toContain(
        "Browser Comparison Bundle",
      );
      expect(readFileSync(comparison.manifestPath, "utf8")).toContain(
        '"wordDelta"',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
