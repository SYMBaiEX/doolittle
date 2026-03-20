import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MediaService } from "./media-service";

const ONE_BY_ONE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5X4nQAAAAASUVORK5CYII=";

describe("MediaService", () => {
  it("returns missing-file metadata without throwing", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-media-missing-"));
    const service = new MediaService(root);

    try {
      const inspection = service.inspect("missing.png");
      expect(inspection.exists).toBe(false);
      expect(inspection.detail).toContain("does not exist");
      expect(inspection.mimeType).toBe("image/png");
      expect(inspection.contentHash).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects image dimensions for png files", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-media-png-"));
    const service = new MediaService(root);
    const path = join(root, "icon.png");

    try {
      writeFileSync(path, Buffer.from(ONE_BY_ONE_PNG, "base64"));
      const inspection = service.inspect("icon.png");
      expect(inspection.exists).toBe(true);
      expect(inspection.kind).toBe("image");
      expect(inspection.width).toBe(1);
      expect(inspection.height).toBe(1);
      expect(inspection.detail).toContain("1x1");
      expect(inspection.contentHash).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("adds preview and counters for text files", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-media-text-"));
    const service = new MediaService(root);
    const path = join(root, "notes.md");

    try {
      writeFileSync(path, "# Hello\n\nThis is a sample note.");
      const inspection = service.inspect("notes.md");
      expect(inspection.kind).toBe("document");
      expect(inspection.lineCount).toBeGreaterThan(0);
      expect(inspection.wordCount).toBeGreaterThan(0);
      expect(inspection.textPreview).toContain("Hello");
      expect(inspection.contentHash).toBeDefined();
      expect(inspection.detail).toContain("words");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
