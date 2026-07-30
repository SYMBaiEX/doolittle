import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DocumentsService } from "./documents-service";

describe("DocumentsService", () => {
  it("routes path and base64 extraction through the registered Eliza PDF service", async () => {
    const directory = mkdtempSync(join(tmpdir(), "doolittle-documents-"));
    const calls: Array<{ text: string; options: Record<string, unknown> }> = [];
    const runtime = {
      getService(name: string) {
        if (name !== "pdf") return null;
        return {
          async convertPdfToTextWithOptions(
            buffer: Buffer,
            options: Record<string, unknown>,
          ) {
            const text = buffer.toString("utf8");
            calls.push({ text, options });
            return { success: true, text: `converted:${text}` };
          },
        };
      },
    };
    const service = new DocumentsService(runtime as never, () => directory);

    try {
      writeFileSync(join(directory, "sample.pdf"), "path-pdf");

      await expect(
        service.extractPdfFromPath("sample.pdf", { startPage: 2 }),
      ).resolves.toBe("converted:path-pdf");
      await expect(
        service.extractPdfFromBase64(
          Buffer.from("base64-pdf").toString("base64"),
          { cleanContent: true },
        ),
      ).resolves.toBe("converted:base64-pdf");
      expect(calls).toEqual([
        { text: "path-pdf", options: { startPage: 2 } },
        { text: "base64-pdf", options: { cleanContent: true } },
      ]);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("fails clearly when the official PDF service is not registered", async () => {
    const service = new DocumentsService({} as never, () => "/workspace");

    await expect(
      service.extractPdfFromBase64(Buffer.from("pdf").toString("base64")),
    ).rejects.toThrow("The Eliza PDF service is not ready");
  });
});
