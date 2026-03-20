import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
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
});
