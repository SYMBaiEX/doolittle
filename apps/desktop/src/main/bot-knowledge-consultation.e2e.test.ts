import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type BackendManager, sourceRuntimeTarget } from "./backend";
import { BotProcessRegistry } from "./bot-process-registry";
import { DesktopExecutionAdmission } from "./execution-admission";

async function waitForRun(url: string, runId: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  let lastReceipt: unknown;
  while (Date.now() < deadline) {
    const response = await fetch(`${url}/chat/runs/${runId}`);
    const payload = (await response.json()) as { run: { status: string } };
    lastReceipt = payload;
    if (payload.run.status === "complete") return;
    if (["cancelled", "error"].includes(payload.run.status))
      throw new Error(
        `Offline run did not complete: ${JSON.stringify(payload)}.`,
      );
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Offline run timed out: ${JSON.stringify(lastReceipt)}.`);
}

describe.skipIf(process.env.DOOLITTLE_WORKER_E2E !== "1")(
  "broker-only project knowledge across actual offline bot processes",
  () => {
    it("promotes a selected SDK document, grants one consultation, revokes it, and isolates cancellation/restart", async () => {
      const directory = mkdtempSync(
        resolve(tmpdir(), "doolittle-knowledge-consult-e2e-"),
      );
      const workspace = resolve(directory, "workspace");
      mkdirSync(workspace, { recursive: true });
      const target = sourceRuntimeTarget(process.cwd());
      // The fixture keeps the source's already persisted run in its active
      // receipt state so the target can be exercised deterministically. All
      // target chat, transcript, and SDK DocumentService calls use real child processes.
      const runtimeFetch: typeof fetch = async (input, init) => {
        if (String(input).endsWith("/chat/runs/source-run")) {
          return Response.json({
            run: {
              runId: "source-run",
              sessionId: "source-session",
              status: "acting",
            },
          });
        }
        return fetch(input, init);
      };
      const defaultBackend = {
        getState: () => ({
          phase: "ready",
          agentId: "9f21e797-127f-0eba-b547-92f9b113fb1e",
          name: "Doolittle",
        }),
        getWorkspaceDirectory: () => workspace,
      } as unknown as BackendManager;
      const registry = new BotProcessRegistry(
        target,
        directory,
        defaultBackend,
        workspace,
        { runtimeFetch, admission: new DesktopExecutionAdmission() },
      );
      try {
        const source = registry.create({
          name: "Source",
          persona: "Source bot",
          projectId: "project-1",
          workspacePath: workspace,
          model: { provider: "offline", model: "offline" },
          permissions: {
            allowDelegation: true,
            toolIds: ["DOOLITTLE_CONSULT_BOT"],
          },
        });
        const recipient = registry.create({
          name: "Recipient",
          persona: "Recipient bot",
          projectId: "project-1",
          workspacePath: workspace,
          model: { provider: "offline", model: "offline" },
        });
        await Promise.all([
          registry.activate(source.id),
          registry.activate(recipient.id),
        ]);
        const sourceUrl = (await registry.backendFor(source.id)).getState().url;
        const recipientUrl = (
          await registry.backendFor(recipient.id)
        ).getState().url;
        expect(sourceUrl && recipientUrl).toBeTruthy();
        for (const url of [sourceUrl, recipientUrl]) {
          const created = await fetch(`${url}/projects`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: "project-1",
              name: "Offline project",
              primaryPath: workspace,
            }),
          });
          expect(created.status, await created.clone().text()).toBe(201);
        }
        registry.bindConversation(source.id, "source-session", "project-1");
        const submitted = await fetch(`${sourceUrl}/chat/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            runId: "source-run",
            roomId: "source-session",
            message: "Selected secret-free project finding: orbit 47.",
            projectId: "project-1",
            source: "desktop",
            workspaceDir: workspace,
          }),
        });
        expect(submitted.status, await submitted.clone().text()).toBe(202);
        registry.bindRun(source.id, "source-session", "source-run");
        await waitForRun(sourceUrl as string, "source-run");
        const transcript = await fetch(
          `${sourceUrl}/sessions/messages?sessionId=source-session&throughRunId=source-run`,
        );
        expect(transcript.status).toBe(200);
        const page = (await transcript.json()) as {
          messages: Array<{ id: string; role: string; text: string }>;
        };
        const selected = page.messages.find(
          (row) => row.role === "user" && row.text.includes("orbit 47"),
        );
        expect(selected?.id).toBeTruthy();
        const record = await registry.knowledge.promote({
          sourceBotId: source.id,
          sessionId: "source-session",
          runId: "source-run",
          messageId: selected?.id as string,
          projectId: "project-1",
          title: "Orbit finding",
          consent: true,
        });
        expect(record.source).toMatchObject({
          botId: source.id,
          messageId: selected?.id,
          projectId: "project-1",
        });
        await expect(
          registry.knowledge.retrieveForConsultation({
            originBotId: source.id,
            originProjectId: "project-1",
            targetBotId: recipient.id,
            knowledgeIds: [record.id],
          }),
        ).rejects.toThrow("grant");
        registry.knowledge.grant(record.id, recipient.id, true);
        expect(
          (
            await registry.knowledge.retrieveForConsultation({
              originBotId: source.id,
              originProjectId: "project-1",
              targetBotId: recipient.id,
              knowledgeIds: [record.id],
            })
          )[0]?.text,
        ).toContain("orbit 47");

        const consultInput = {
          origin: {
            botId: source.id,
            agentId: source.agentId,
            sessionId: "source-session",
            runId: "source-run",
            projectId: "project-1",
          },
          targetBotId: recipient.id,
          objective: "Acknowledge the selected project finding.",
          context: [],
          knowledgeIds: [record.id],
          deadline: new Date(Date.now() + 60_000).toISOString(),
        };
        const consultation = await registry.consultations.dispatch(
          source.id,
          consultInput,
        );
        expect(consultation.status).toBe("accepted");
        await waitForRun(recipientUrl as string, consultation.targetRunId);
        const result = await registry.consultations.wait(
          source.id,
          consultation.dispatchId,
        );
        expect(result.owner).toMatchObject({
          botId: recipient.id,
          sessionId: consultation.targetSessionId,
          runId: consultation.targetRunId,
        });
        const targetTranscript = await fetch(
          `${recipientUrl}/sessions/messages?sessionId=${consultation.targetSessionId}&throughRunId=${consultation.targetRunId}`,
        );
        expect(targetTranscript.status).toBe(200);
        expect(await targetTranscript.text()).toContain("orbit 47");
        expect((await fetch(`${recipientUrl}/memory`)).status).toBe(404);
        expect(
          (
            await fetch(
              `${recipientUrl}/knowledge/documents/${record.documentId}`,
            )
          ).status,
        ).toBe(404);

        registry.knowledge.revoke(record.id, recipient.id);
        await expect(
          registry.consultations.dispatch(source.id, consultInput),
        ).rejects.toThrow("grant");
        const cancelled = await registry.consultations.dispatch(source.id, {
          ...consultInput,
          knowledgeIds: [],
        });
        await registry.consultations.cancel(source.id, cancelled.dispatchId);
        expect(
          registry.consultations.ledger.get(cancelled.dispatchId)?.status,
        ).toBe("cancelled");
        expect(
          (
            await fetch(`${recipientUrl}/runtime/executions/stop-all`, {
              method: "POST",
            })
          ).status,
        ).toBe(403);
        await Promise.all([
          (await registry.backendFor(source.id)).stopAllOwnedExecutions(),
          (await registry.backendFor(recipient.id)).stopAllOwnedExecutions(),
        ]);
        expect((await registry.backendFor(source.id)).getState().phase).toBe(
          "ready",
        );
        await registry.stop(recipient.id);
        expect((await registry.backendFor(source.id)).getState().phase).toBe(
          "ready",
        );
        await registry.activate(recipient.id);
        const restartedUrl = (
          await registry.backendFor(recipient.id)
        ).getState().url;
        const persisted = await fetch(
          `${restartedUrl}/sessions/messages?sessionId=${consultation.targetSessionId}&throughRunId=${consultation.targetRunId}`,
        );
        expect(persisted.status).toBe(200);
      } finally {
        await registry.stopAll();
        rmSync(directory, { recursive: true, force: true });
      }
    }, 120_000);
  },
);
