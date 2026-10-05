import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sourceRuntimeTarget } from "./backend";
import { KnowledgeDocumentWorker } from "./knowledge-document-worker";

describe.skipIf(process.env.DOOLITTLE_WORKER_E2E !== "1")(
  "private offline SDK document worker",
  () => {
    it("stores one explicit SDK document without exposing chat or private memory routes", async () => {
      const dataDir = mkdtempSync(resolve(tmpdir(), "doolittle-doc-worker-"));
      const worker = new KnowledgeDocumentWorker(
        sourceRuntimeTarget(process.cwd()),
        dataDir,
      );
      try {
        const documentId = await worker.add({
          clientDocumentId: randomUUID(),
          content:
            "Selected project finding. Only the approved broker may read it.",
          title: "Selected finding",
          projectId: "project-1",
        });
        expect(documentId).toMatch(/^[0-9a-f-]{36}$/iu);
        expect(await worker.read(documentId)).toContain(
          "Selected project finding",
        );
        const backend = (
          worker as unknown as { backend: { getState(): { url?: string } } }
        ).backend;
        const url = backend.getState().url;
        expect(url).toBeTruthy();
        expect((await fetch(`${url}/chat/runs`)).status).toBe(404);
        expect((await fetch(`${url}/memory`)).status).toBe(404);
        expect(
          (await fetch(`${url}/knowledge/documents/${documentId}`)).status,
        ).toBe(403);
      } finally {
        await worker.stop();
        rmSync(dataDir, { recursive: true, force: true });
      }
    }, 60_000);
  },
);
