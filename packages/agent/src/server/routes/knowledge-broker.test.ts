import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleKnowledgeBrokerRoutes } from "./knowledge-broker";

const mocks = vi.hoisted(() => ({
  addDocument: vi.fn(async () => ({
    storedDocumentMemoryId: "00000000-0000-4000-8000-000000000002",
    fragmentCount: 1,
  })),
  getDocumentById: vi.fn(async () => ({
    content: { text: "Selected explicit content" },
  })),
}));
vi.mock("@elizaos/agent/api/documents-service-loader", () => ({
  getDocumentsService: vi.fn(async () => ({ service: mocks })),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const context = {
  runtime: { agentId: "00000000-0000-4000-8000-000000000001" },
} as unknown as AppContext;
const base = {
  clientDocumentId: "00000000-0000-4000-8000-000000000003",
  content: "One explicitly selected message",
  title: "Finding",
};
async function post(input: unknown, token = "test-broker-token") {
  const url = new URL("http://localhost/knowledge/documents");
  return handleKnowledgeBrokerRoutes(
    context,
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    }),
    url,
  );
}
function enabled() {
  vi.stubEnv("DOOLITTLE_KNOWLEDGE_BROKER", "1");
  vi.stubEnv("DOOLITTLE_KNOWLEDGE_BROKER_TOKEN", "test-broker-token");
}
describe("private SDK knowledge document boundary", () => {
  it("stores real team metadata without disguising it as project metadata", async () => {
    enabled();
    const scope = { kind: "team", id: "00000000-0000-4000-8000-000000000004" };
    expect((await post({ ...base, scope }))?.status).toBe(201);
    expect(mocks.addDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "agent-private",
        originalFilename: `knowledge-${base.clientDocumentId}.txt`,
        content: JSON.stringify({ version: 1, text: base.content }),
        metadata: {
          sharedKnowledgeScope: scope,
          sharedKnowledgeTextEncoding: "json-v1",
          title: "Finding",
          source: "explicit-desktop-promotion",
        },
      }),
    );
  });
  it("retains legacy project calls, but rejects ambiguous and invalid scopes", async () => {
    enabled();
    expect((await post({ ...base, projectId: "project-1" }))?.status).toBe(201);
    expect(mocks.addDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          projectId: "project-1",
          sharedKnowledgeScope: { kind: "project", id: "project-1" },
        }),
      }),
    );
    for (const scope of [
      { kind: "team", id: "project-1" },
      { kind: "private", id: "project-1" },
      { kind: "team", id: 1 },
    ])
      expect((await post({ ...base, scope }))?.status).toBe(400);
    expect(
      (
        await post({
          ...base,
          scope: { kind: "project", id: "project-1" },
          projectId: "project-1",
        })
      )?.status,
    ).toBe(400);
  });
  it("denies ordinary workers and unauthenticated requests without touching SDK storage", async () => {
    vi.stubEnv("DOOLITTLE_KNOWLEDGE_BROKER", "0");
    expect((await post({ ...base, projectId: "project-1" }))?.status).toBe(404);
    enabled();
    expect(
      (await post({ ...base, projectId: "project-1" }, "wrong"))?.status,
    ).toBe(403);
    expect(mocks.addDocument).not.toHaveBeenCalled();
  });
  it("reports storage failures without committing a successful receipt", async () => {
    enabled();
    mocks.addDocument.mockRejectedValueOnce(new Error("Private SDK error"));
    expect(
      (await post({ ...base, scope: { kind: "project", id: "project-1" } }))
        ?.status,
    ).toBe(500);
  });
});
