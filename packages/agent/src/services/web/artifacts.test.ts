import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hashContent,
  slugifyUrl,
  writeArtifact,
  writeScreenshotArtifact,
} from "./artifacts";
import type { WebPageSnapshot } from "./service-types";

function createPage(mode: "browser" | "fallback"): WebPageSnapshot {
  return {
    url: "https://example.com/hello-world",
    title: "Hello World",
    metaDescription: "Greeting page",
    canonicalUrl: "https://example.com/hello-world",
    text: "Hello world from Doolittle",
    provider: mode === "browser" ? "lightpanda" : "basic",
    mode,
    renderedAt: "2026-03-30T12:00:00.000Z",
    contentType: "text/html",
    contentLength: 128,
    wordCount: 4,
    lineCount: 1,
    linkCount: 1,
    imageCount: 0,
    headingCount: 1,
    contentHash: hashContent("<h1>Hello world</h1>"),
  };
}

describe("web-service artifacts", () => {
  it("writes snapshot and screenshot artifacts for both pixel and placeholder captures", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-web-artifacts-"));

    try {
      const snapshot = writeArtifact(root, "snapshot", createPage("fallback"), [
        "snapshot note",
      ]);
      const pixel = writeScreenshotArtifact(root, createPage("browser"), [
        "pixel note",
      ]);
      const placeholder = writeScreenshotArtifact(
        root,
        createPage("fallback"),
        ["placeholder note"],
      );

      expect(existsSync(snapshot.markdownPath)).toBe(true);
      expect(readFileSync(snapshot.markdownPath, "utf8")).toContain(
        "Hello World",
      );
      expect(readFileSync(snapshot.jsonPath, "utf8")).toContain(
        "snapshot note",
      );

      expect(pixel.captureMode).toBe("pixel");
      expect(pixel.screenshotPath.endsWith(".png")).toBe(true);
      expect(existsSync(pixel.screenshotPath)).toBe(true);
      expect(existsSync(pixel.svgPath)).toBe(true);

      expect(placeholder.captureMode).toBe("placeholder");
      expect(placeholder.screenshotPath.endsWith(".md")).toBe(true);
      expect(readFileSync(placeholder.markdownPath, "utf8")).toContain(
        "placeholder note",
      );
      expect(readFileSync(placeholder.jsonPath, "utf8")).toContain(
        '"captureMode": "placeholder"',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("slugifies URLs deterministically", () => {
    expect(slugifyUrl("https://example.com/hello-world?x=1")).toBe(
      "example-com-hello-world-x-1",
    );
    expect(slugifyUrl("data:text/html,<h1>Hi</h1>")).toContain(
      "data-text-html",
    );
  });
});
