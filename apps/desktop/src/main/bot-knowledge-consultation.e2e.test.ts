import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BackendManager, sourceRuntimeTarget } from "./backend";
import { BotProcessRegistry } from "./bot-process-registry";
import { DesktopExecutionAdmission } from "./execution-admission";
import { releaseAbandonedExecutionClaim } from "./execution-receipt";

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
  "broker-only project and team knowledge across actual offline bot processes",
  () => {
    it.each(["project", "team"] as const)(
      "promotes selected %s SDK knowledge, grants an attributed consultation, and preserves isolated revocation/restart",
      async (scopeKind) => {
        const directory = mkdtempSync(
          resolve(tmpdir(), "doolittle-knowledge-consult-e2e-"),
        );
        const workspace = resolve(directory, "workspace");
        const leadData = resolve(directory, "lead-data");
        const leadWorkspace = resolve(directory, "lead-workspace");
        for (const path of [workspace, leadData, leadWorkspace])
          mkdirSync(path, { recursive: true, mode: 0o700 });
        const target = sourceRuntimeTarget(process.cwd());
        const admission = new DesktopExecutionAdmission();
        const commonPrefix = "Shared boilerplate. ".repeat(120);
        const sourceText = `${commonPrefix}Selected secret-free project finding: orbit 47. SECRET FROM TEAM A`;
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
        const lead = new BackendManager(
          target,
          leadData,
          leadWorkspace,
          runtimeFetch,
          {
            sharedEngine: true,
            hostRpcBotId: "default",
            isolatedEnvironment: {
              PATH: process.env.PATH ?? "",
              HOME: leadData,
              USERPROFILE: leadData,
              ELIZA_HOME: leadData,
              LANG: "C.UTF-8",
              DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
              DOOLITTLE_USE_LINKED_DEVIN_AUTH: "false",
              ...(target.environment?.ELECTRON_RUN_AS_NODE
                ? {
                    ELECTRON_RUN_AS_NODE:
                      target.environment.ELECTRON_RUN_AS_NODE,
                  }
                : {}),
            },
            workerHostHandler: async (request, signal) => {
              if (request.operation === "workspace.resolve") {
                const payload = request.payload as {
                  sessionId?: unknown;
                } | null;
                if (typeof payload?.sessionId !== "string")
                  throw new Error("Conversation scope is required.");
                return registry.resolveVerifiedConversationWorkspace(
                  "default",
                  payload.sessionId,
                );
              }
              if (
                request.operation !== "execution.claim" &&
                request.operation !== "execution.release"
              )
                throw new Error("The lead host operation is unavailable.");
              return admission.handle(
                "default",
                request.operation,
                request.payload,
                {},
                signal,
              );
            },
            workerHostOnAbandonedResult: (request, result) =>
              releaseAbandonedExecutionClaim(
                admission,
                "default",
                request,
                result,
              ),
          },
        );
        const registry = new BotProcessRegistry(
          target,
          directory,
          lead,
          leadWorkspace,
          { runtimeFetch, admission },
        );
        let recovered: BotProcessRegistry | undefined;
        try {
          const leadState = await lead.start();
          expect(leadState.phase, leadState.detail).toBe("ready");
          const created = await fetch(`${leadState.url}/projects`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: "project-1",
              name: "Offline project",
              primaryPath: workspace,
            }),
          });
          expect(created.status, await created.clone().text()).toBe(201);
          const project = await registry.readLeadProject("project-1");
          const source = registry.create({
            name: "Source",
            persona: "Source bot",
            model: { provider: "offline", model: "offline" },
            permissions: {
              allowDelegation: true,
              toolIds: ["DOOLITTLE_CONSULT_BOT"],
            },
          });
          const recipient = registry.create({
            name: "Recipient",
            persona: "Recipient bot",
            model: { provider: "offline", model: "offline" },
          });
          registry.bindConversationWorkspace(
            source.id,
            "source-session",
            project,
          );
          await Promise.all([
            registry.activate(source.id),
            registry.activate(recipient.id),
          ]);
          const sourceUrl = (await registry.backendFor(source.id)).getState()
            .url;
          const recipientUrl = (
            await registry.backendFor(recipient.id)
          ).getState().url;
          expect(sourceUrl && recipientUrl).toBeTruthy();
          const submitted = await fetch(`${sourceUrl}/chat/runs`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              runId: "source-run",
              roomId: "source-session",
              message: sourceText,
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
          const team =
            scopeKind === "team"
              ? registry.teams.create({
                  name: "Offline explicit team",
                  memberBotIds: [source.id, recipient.id],
                  expectedRevision: 0,
                })
              : undefined;
          const record = await registry.knowledge.promote({
            sourceBotId: source.id,
            sessionId: "source-session",
            runId: "source-run",
            messageId: selected?.id as string,
            ...(team ? { teamId: team.id } : { projectId: "project-1" }),
            title: "Orbit finding",
            consent: true,
          });
          expect(record.source).toMatchObject({
            botId: source.id,
            messageId: selected?.id,
            projectId: "project-1",
          });
          expect(record.scope).toEqual(
            team
              ? { kind: "team", id: team.id }
              : { kind: "project", id: "project-1" },
          );
          let otherRecordId: string | undefined;
          let otherText: string | undefined;
          if (team) {
            const otherTeam = registry.teams.create({
              name: "Other explicit team",
              memberBotIds: [source.id, recipient.id],
              expectedRevision: registry.teams.list().revision,
            });
            otherText = `${commonPrefix}PUBLIC FROM TEAM B`;
            const submittedB = await fetch(`${sourceUrl}/chat/runs`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                runId: "source-run-b",
                roomId: "source-session",
                message: otherText,
                projectId: "project-1",
                source: "desktop",
                workspaceDir: workspace,
              }),
            });
            expect(submittedB.status).toBe(202);
            registry.bindRun(source.id, "source-session", "source-run-b");
            await waitForRun(sourceUrl as string, "source-run-b");
            const transcriptB = await fetch(
              `${sourceUrl}/sessions/messages?sessionId=source-session&throughRunId=source-run-b`,
            );
            const pageB = (await transcriptB.json()) as {
              messages: Array<{ id: string; role: string; text: string }>;
            };
            const selectedB = pageB.messages.find(
              (message) =>
                message.role === "user" && message.text === otherText,
            );
            expect(selectedB?.id).toBeTruthy();
            const otherRecord = await registry.knowledge.promote({
              sourceBotId: source.id,
              sessionId: "source-session",
              runId: "source-run-b",
              messageId: selectedB?.id as string,
              teamId: otherTeam.id,
              title: "Orbit finding",
              consent: true,
            });
            otherRecordId = otherRecord.id;
            expect(otherRecord.documentId).not.toBe(record.documentId);
            registry.knowledge.grant(otherRecord.id, recipient.id, true);
            expect(
              (
                await registry.knowledge.retrieveForConsultation({
                  originBotId: source.id,
                  originSessionId: "source-session",
                  targetBotId: recipient.id,
                  knowledgeIds: [otherRecord.id],
                })
              )[0]?.text,
            ).toBe(otherText);
          }
          await expect(
            registry.knowledge.retrieveForConsultation({
              originBotId: source.id,
              originSessionId: "source-session",
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
                originSessionId: "source-session",
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
          if (otherRecordId)
            expect(
              (
                await registry.knowledge.retrieveForConsultation({
                  originBotId: source.id,
                  originSessionId: "source-session",
                  targetBotId: recipient.id,
                  knowledgeIds: [otherRecordId],
                })
              )[0]?.text,
            ).toBe(otherText);
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
          // Re-grant explicitly, then recreate the whole host registry and private
          // DocumentService worker. Neither membership nor grant IDs are inferred.
          registry.knowledge.grant(record.id, recipient.id, true);
          await registry.stopAll();
          recovered = new BotProcessRegistry(
            target,
            directory,
            lead,
            leadWorkspace,
            { runtimeFetch, admission },
          );
          expect(recovered.knowledge.ledger.get(record.id)).toEqual(record);
          expect(
            recovered.knowledge.ledger.granted(record.id, recipient.id),
          ).toBe(true);
          const selection = {
            originBotId: source.id,
            originSessionId: "source-session",
            originProjectId: "project-1",
            targetBotId: recipient.id,
            knowledgeIds: [record.id],
          };
          expect(
            (await recovered.knowledge.retrieveForConsultation(selection))[0]
              ?.text,
          ).toContain("orbit 47");
          expect(
            recovered.consultations.ledger.get(consultation.dispatchId)
              ?.targetRunId,
          ).toBe(consultation.targetRunId);
          if (team) {
            expect(recovered.teams.get(team.id)).toEqual(team);
            recovered.teams.update(team.id, {
              memberBotIds: [source.id],
              expectedRevision: recovered.teams.list().revision,
            });
            await expect(
              recovered.knowledge.retrieveForConsultation(selection),
            ).rejects.toThrow("current team member");
            recovered.teams.update(team.id, {
              memberBotIds: [source.id, recipient.id],
              expectedRevision: recovered.teams.list().revision,
            });
            recovered.teams.archive(team.id, recovered.teams.list().revision);
            await expect(
              recovered.knowledge.retrieveForConsultation(selection),
            ).rejects.toThrow("archived");
            if (otherRecordId)
              expect(
                (
                  await recovered.knowledge.retrieveForConsultation({
                    originBotId: source.id,
                    originSessionId: "source-session",
                    targetBotId: recipient.id,
                    knowledgeIds: [otherRecordId],
                  })
                )[0]?.text,
              ).toBe(otherText);
          }
        } finally {
          try {
            await recovered?.stopAll();
            await registry.stopAll();
          } finally {
            try {
              await lead.stop();
            } finally {
              rmSync(directory, { recursive: true, force: true });
            }
          }
        }
      },
      120_000,
    );
  },
);
