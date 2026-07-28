import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleSessionTransferRoutes } from "./session-transfer";

function createContext() {
  return {
    services: {
      sessions: {
        exportSessionArchive: (sessionId: string) => ({
          schema: "doolittle.session.archive",
          version: 1,
          source: { sessionId },
        }),
        previewSessionArchive: () => ({
          version: 1,
          messageCount: 2,
        }),
        importSessionArchive: (input: { projectId?: string }) => ({
          sessionId: "import:new",
          projectId: input.projectId,
        }),
      },
    },
  } as unknown as AppContext;
}

describe("handleSessionTransferRoutes", () => {
  it("exports an existing session archive", async () => {
    const response = await handleSessionTransferRoutes(
      createContext(),
      new Request("http://localhost/sessions/export?sessionId=session-1"),
      new URL("http://localhost/sessions/export?sessionId=session-1"),
    );
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      archive: {
        version: 1,
        source: { sessionId: "session-1" },
      },
    });
  });

  it("previews and imports archives without implicitly selecting a project", async () => {
    const preview = await handleSessionTransferRoutes(
      createContext(),
      request("/sessions/import/preview", { archive: { version: 1 } }),
      new URL("http://localhost/sessions/import/preview"),
    );
    const imported = await handleSessionTransferRoutes(
      createContext(),
      request("/sessions/import", { archive: { version: 1 } }),
      new URL("http://localhost/sessions/import"),
    );
    const scoped = await handleSessionTransferRoutes(
      createContext(),
      request("/sessions/import", {
        archive: { version: 1 },
        projectId: "project-1",
      }),
      new URL("http://localhost/sessions/import"),
    );

    await expect(preview?.json()).resolves.toEqual({
      preview: { version: 1, messageCount: 2 },
    });
    await expect(imported?.json()).resolves.toEqual({
      imported: { sessionId: "import:new" },
    });
    await expect(scoped?.json()).resolves.toEqual({
      imported: { sessionId: "import:new", projectId: "project-1" },
    });
  });

  it("validates ids, JSON bodies, and unrelated routes", async () => {
    const badExport = await handleSessionTransferRoutes(
      createContext(),
      new Request("http://localhost/sessions/export?sessionId=../../secret"),
      new URL("http://localhost/sessions/export?sessionId=../../secret"),
    );
    const badImport = await handleSessionTransferRoutes(
      createContext(),
      request("/sessions/import", {
        archive: { version: 1 },
        projectId: "/absolute/path",
      }),
      new URL("http://localhost/sessions/import"),
    );
    const unrelated = await handleSessionTransferRoutes(
      createContext(),
      new Request("http://localhost/other"),
      new URL("http://localhost/other"),
    );

    expect(badExport?.status).toBe(400);
    expect(badImport?.status).toBe(400);
    expect(unrelated).toBeNull();
  });
});

function request(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
