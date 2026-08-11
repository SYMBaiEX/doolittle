import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleContextDocumentRoutes } from "./context-documents";

function createContext(): AppContext {
  return {
    runtime: {},
    services: {
      contextFiles: {
        list: () => ["README.md", "notes.md"],
      },
      documents: {
        extractPdfFromPath: async (
          path: string,
          options?: Record<string, unknown>,
        ) => `path:${path}:${JSON.stringify(options ?? {})}`,
        extractPdfFromBase64: async (
          base64: string,
          options?: Record<string, unknown>,
        ) => `base64:${base64}:${JSON.stringify(options ?? {})}`,
      },
    },
  } as unknown as AppContext;
}

describe("handleContextDocumentRoutes", () => {
  it("returns context files and extracts PDFs from path or base64", async () => {
    const files = await handleContextDocumentRoutes(
      createContext(),
      new Request("http://localhost/context/files"),
      new URL("http://localhost/context/files"),
    );
    const pathResponse = await handleContextDocumentRoutes(
      createContext(),
      new Request("http://localhost/documents/pdf/extract", {
        method: "POST",
        body: JSON.stringify({ path: "/tmp/demo.pdf" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/documents/pdf/extract"),
    );
    const base64Response = await handleContextDocumentRoutes(
      createContext(),
      new Request("http://localhost/documents/pdf/extract", {
        method: "POST",
        body: JSON.stringify({ base64: "UERGREFUQQ==", startPage: 1 }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/documents/pdf/extract"),
    );

    await expect(files?.json()).resolves.toEqual({
      files: ["README.md", "notes.md"],
    });
    await expect(pathResponse?.json()).resolves.toEqual({
      text: "path:/tmp/demo.pdf:{}",
    });
    await expect(base64Response?.json()).resolves.toEqual({
      text: 'base64:UERGREFUQQ==:{"startPage":1}',
    });
  });

  it("validates missing PDF inputs", async () => {
    const response = await handleContextDocumentRoutes(
      createContext(),
      new Request("http://localhost/documents/pdf/extract", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/documents/pdf/extract"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "Provide exactly one valid path or base64 PDF payload.",
    });
  });

  it("rejects malformed and ambiguous PDF requests before service access", async () => {
    const context = createContext();
    const fromPath = vi.spyOn(context.services.documents, "extractPdfFromPath");
    const fromBase64 = vi.spyOn(
      context.services.documents,
      "extractPdfFromBase64",
    );
    const bodies: Array<string | Record<string, unknown> | null> = [
      "not-json",
      null,
      { path: "one.pdf", base64: "UERG" },
      { path: "one.pdf", unknown: true },
      { base64: "not base64" },
      { path: "one.pdf", startPage: 2, endPage: 1 },
      { path: "one.pdf", preserveWhitespace: "yes" },
    ];

    for (const body of bodies) {
      const response = await handleContextDocumentRoutes(
        context,
        new Request("http://localhost/documents/pdf/extract", {
          method: "POST",
          body: body === "not-json" ? body : JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
        new URL("http://localhost/documents/pdf/extract"),
      );
      expect(response?.status).toBe(400);
    }

    expect(fromPath).not.toHaveBeenCalled();
    expect(fromBase64).not.toHaveBeenCalled();
  });

  it("does not misclassify document service failures as request errors", async () => {
    const context = createContext();
    vi.spyOn(
      context.services.documents,
      "extractPdfFromPath",
    ).mockRejectedValue(new TypeError("PDF parser failed"));

    await expect(
      handleContextDocumentRoutes(
        context,
        new Request("http://localhost/documents/pdf/extract", {
          method: "POST",
          body: JSON.stringify({ path: "document.pdf" }),
          headers: { "content-type": "application/json" },
        }),
        new URL("http://localhost/documents/pdf/extract"),
      ),
    ).rejects.toThrow("PDF parser failed");
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleContextDocumentRoutes(
      createContext(),
      new Request("http://localhost/not-context"),
      new URL("http://localhost/not-context"),
    );

    expect(response).toBeNull();
  });
});
