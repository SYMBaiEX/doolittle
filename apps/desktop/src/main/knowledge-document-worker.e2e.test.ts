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
        const teamScope = { kind: "team" as const, id: randomUUID() };
        const teamDocumentId = await worker.add({
          clientDocumentId: randomUUID(),
          content: "Explicitly selected team finding; not private bot memory.",
          title: "Team finding",
          scope: teamScope,
        });
        expect(await worker.read(teamDocumentId)).toContain(
          "selected team finding",
        );
        const backend = (
          worker as unknown as { backend: { getState(): { url?: string } } }
        ).backend;
        const url = backend.getState().url;
        expect(url).toBeTruthy();
        const token = (worker as unknown as { token: string }).token;
        const metadata = await fetch(
          `${url}/knowledge/documents/${teamDocumentId}`,
          { headers: { authorization: `Bearer ${token}` } },
        );
        expect(await metadata.json()).toMatchObject({
          storageScope: "agent-private",
          sharedKnowledgeScope: teamScope,
        });
        const commonPrefix = "Shared boilerplate. ".repeat(120);
        const contentA = `${commonPrefix}SECRET FROM TEAM A`;
        const contentB = `${commonPrefix}PUBLIC FROM TEAM B`;
        const documentA = await worker.add({
          clientDocumentId: randomUUID(),
          title: "Same title",
          content: contentA,
          scope: teamScope,
        });
        const otherTeam = { kind: "team" as const, id: randomUUID() };
        const documentB = await worker.add({
          clientDocumentId: randomUUID(),
          title: "Same title",
          content: contentB,
          scope: otherTeam,
        });
        expect(documentB).not.toBe(documentA);
        expect(await worker.read(documentA)).toBe(contentA);
        expect(await worker.read(documentB)).toBe(contentB);
        const otherMetadata = await fetch(
          `${url}/knowledge/documents/${documentB}`,
          { headers: { authorization: `Bearer ${token}` } },
        );
        expect(await otherMetadata.json()).toMatchObject({
          storageScope: "agent-private",
          sharedKnowledgeScope: otherTeam,
        });
        for (const content of [
          "a",
          "é😀\nExact Unicode",
          "U2VsZWN0ZWQgcGxhaW4gdGV4dA==",
        ]) {
          const exact = await worker.add({
            clientDocumentId: randomUUID(),
            title: "Exact text",
            content,
            scope: teamScope,
          });
          expect(await worker.read(exact)).toBe(content);
        }
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
