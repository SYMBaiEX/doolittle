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
        "data:text/html,<html><head><title>Shot</title></head><body><p>Artifact</p></body></html>",
      );
      const content = readFileSync(path, "utf8");
      const metadata = readFileSync(path.replace(/\.md$/u, ".json"), "utf8");
      expect(content).toContain("Browser Screenshot");
      expect(content).toContain("Source: data:text/html");
      expect(content).toContain("Artifact");
      expect(content).toContain("Content type:");
      expect(existsSync(path.replace(/\.md$/u, ".json"))).toBe(true);
      expect(metadata).toContain("\"contentHash\"");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
