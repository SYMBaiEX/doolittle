import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleContextDocumentRoutes } from "./context-documents";

function createContext(options?: { nativePdf?: boolean }): AppContext {
  return {
    runtime: {
      getService: (name: string) =>
        name === "knowledge" && options?.nativePdf
          ? {
              extractPdf: async (path: string) => `native:${path}`,
            }
          : undefined,
    },
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
      createContext({ nativePdf: true }),
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
        body: JSON.stringify({ base64: "PDFDATA", startPage: 1 }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/documents/pdf/extract"),
    );

    await expect(files?.json()).resolves.toEqual({
      files: ["README.md", "notes.md"],
    });
    await expect(pathResponse?.json()).resolves.toEqual({
      text: "native:/tmp/demo.pdf",
    });
    await expect(base64Response?.json()).resolves.toEqual({
      text: 'base64:PDFDATA:{"startPage":1}',
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
      error: "path or base64 is required",
    });
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
