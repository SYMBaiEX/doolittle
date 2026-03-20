import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebService } from "./web-service";

describe("WebService", () => {
  it("reports fallback mode when lightpanda is unavailable", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-web-test-"));
    const service = new WebService(
      () => ({
        provider: "lightpanda",
        command: "definitely-not-lightpanda",
        obeyRobots: true,
      }),
      root,
    );

    try {
      const status = await service.status();
      expect(status.provider).toBe("lightpanda");
      expect(status.ready).toBe(false);
      expect(status.mode).toBe("fallback");
      expect(status.artifacts.snapshot).toBe(true);
      expect(status.artifacts.screenshot).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fetches readable text in basic mode", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-web-basic-"));
    const service = new WebService(
      () => ({
        provider: "basic",
        command: "lightpanda",
        obeyRobots: true,
      }),
      root,
    );

    try {
      const page = await service.fetchText(
        "data:text/html,<html><head><title>Hello</title></head><body><h1>World</h1></body></html>",
      );
      expect(page.mode).toBe("fallback");
      expect(page.title).toBe("Hello");
      expect(page.text).toContain("World");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("extracts page metadata and structured line breaks", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-web-meta-"));
    const service = new WebService(
      () => ({
        provider: "basic",
        command: "lightpanda",
        obeyRobots: true,
      }),
      root,
    );

    try {
      const page = await service.fetchText(
        "data:text/html,<html><head><title>Meta</title><meta name='description' content='Useful summary'><link rel='canonical' href='https://example.com/meta'></head><body><h1>Alpha</h1><p>Beta</p><img src='hero.png'><p>Gamma</p></body></html>",
      );
      expect(page.title).toBe("Meta");
      expect(page.metaDescription).toBe("Useful summary");
      expect(page.canonicalUrl).toBe("https://example.com/meta");
      expect(page.imageCount).toBe(1);
      expect(page.contentLength).toBeGreaterThan(0);
      expect(page.lineCount).toBeGreaterThan(1);
      expect(page.text).toContain("Alpha");
      expect(page.text).toContain("\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("creates screenshot artifacts in fallback mode", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-web-shot-"));
    const service = new WebService(
      () => ({
        provider: "basic",
        command: "lightpanda",
        obeyRobots: true,
      }),
      root,
    );

    try {
      const path = await service.screenshot(
        "data:text/html,<html><head><title>Shot</title><meta name='description' content='Screenshot summary'><link rel='canonical' href='https://example.com/shot'></head><body><p>Artifact</p><img src='hero.png'></body></html>",
      );
      const content = readFileSync(path, "utf8");
      const metadata = readFileSync(path.replace(/\.md$/u, ".json"), "utf8");
      expect(content).toContain("Browser Screenshot");
      expect(content).toContain("Source: data:text/html");
      expect(content).toContain("Artifact");
      expect(content).toContain("Content type:");
      expect(content).toContain("Images:");
      expect(existsSync(path.replace(/\.md$/u, ".json"))).toBe(true);
      expect(content).toContain("Description:");
      expect(content).toContain("Canonical:");
      expect(metadata).toContain("\"contentHash\"");
      expect(existsSync(path.replace(/\.md$/u, ".svg"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("inspects a page and emits both browser artifacts", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-web-inspect-"));
    const service = new WebService(
      () => ({
        provider: "basic",
        command: "lightpanda",
        obeyRobots: true,
      }),
      root,
    );

    try {
      const inspection = await service.inspect(
        "data:text/html,<html><head><title>Inspect</title><meta name='description' content='Inspect summary'></head><body><h1>Alpha</h1><p>Beta</p></body></html>",
      );
      expect(inspection.page.title).toBe("Inspect");
      expect(inspection.snapshotPath).toContain("snapshot-");
      expect(inspection.screenshotPath).toContain("screenshot-");
      expect(existsSync(inspection.screenshotSvgPath)).toBe(true);
      expect(inspection.status.lastSnapshotAt).toBeDefined();
      expect(inspection.status.lastScreenshotAt).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
