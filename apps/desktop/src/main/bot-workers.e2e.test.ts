import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BackendManager,
  type BackendManagerOptions,
  sourceRuntimeTarget,
} from "./backend";
import { BotProcessRegistry } from "./bot-process-registry";
import {
  assertBotSessionRequest,
  attributeBotSessionResponse,
} from "./bot-session-routing";
import { DesktopExecutionAdmission } from "./execution-admission";

// Explicit opt-in: two actual server processes, private temporary homes, and
// only the offline model. The normal unit suite never launches a runtime.
describe.skipIf(process.env.DOOLITTLE_WORKER_E2E !== "1")(
  "two isolated offline bot workers",
  () => {
    it("attests distinct identities and keeps data and CLI homes separate", async () => {
      const directory = mkdtempSync(
        resolve(tmpdir(), "doolittle-workers-e2e-"),
      );
      const workspace = resolve(directory, "workspace");
      const forbiddenHome = resolve(directory, "forbidden-host-home");
      mkdirSync(workspace, { recursive: true });
      writeFileSync(resolve(workspace, "computer.txt"), "before");
      mkdirSync(resolve(forbiddenHome, ".codex"), { recursive: true });
      mkdirSync(resolve(forbiddenHome, ".claude"), { recursive: true });
      writeFileSync(
        resolve(forbiddenHome, ".codex", "auth.json"),
        '{"sentinel":true}',
      );
      writeFileSync(
        resolve(forbiddenHome, ".claude", "auth.json"),
        '{"sentinel":true}',
      );
      const target = sourceRuntimeTarget(process.cwd());
      target.environment = {
        HOME: forbiddenHome,
        CODEX_HOME: resolve(forbiddenHome, ".codex"),
        CLAUDE_CONFIG_DIR: resolve(forbiddenHome, ".claude"),
        OPENAI_API_KEY: "forbidden-test-sentinel",
      };
      const defaultBackend = {
        getState: () => ({
          phase: "ready",
          agentId: "9f21e797-127f-0eba-b547-92f9b113fb1e",
          name: "Doolittle",
        }),
        getWorkspaceDirectory: () => workspace,
      } as unknown as BackendManager;
      const configurations: BackendManagerOptions[] = [];
      const admission = new DesktopExecutionAdmission();
      const registry = new BotProcessRegistry(
        target,
        directory,
        defaultBackend,
        workspace,
        {
          admission,
          createBackend: (
            launchTarget,
            dataDir,
            path,
            runtimeFetch,
            options,
          ) => {
            configurations.push(options);
            return new BackendManager(
              launchTarget,
              dataDir,
              path,
              runtimeFetch,
              options,
            );
          },
        },
      );
      try {
        const first = registry.create({
          name: "Worker One",
          persona: "One isolated bot.",
          model: { provider: "offline", model: "offline" },
          permissions: { allowMutation: true },
        });
        const second = registry.create({
          name: "Worker Two",
          persona: "Another isolated bot.",
          model: { provider: "offline", model: "offline" },
        });
        await Promise.all([
          registry.activate(first.id),
          registry.activate(second.id),
        ]);
        expect(configurations).toHaveLength(2);
        for (const config of configurations) {
          const env = config.isolatedEnvironment;
          expect(env?.HOME).not.toBe(forbiddenHome);
          expect(env?.CODEX_HOME).toContain("/bots/");
          expect(env?.CLAUDE_CONFIG_DIR).toContain("/bots/");
          expect(env?.OPENAI_API_KEY).toBeUndefined();
        }
        const one = await registry.backendFor(first.id);
        const two = await registry.backendFor(second.id);
        expect(one.getState().url).not.toBe(two.getState().url);
        const identities = await Promise.all(
          [one, two].map(async (backend) => {
            const response = await fetch(
              `${backend.getState().url}/runtime/bot-identity`,
            );
            expect(response.status).toBe(200);
            return response.json() as Promise<{
              botId: string;
              agentId: string;
            }>;
          }),
        );
        expect(identities.map((value) => value.botId)).toEqual([
          first.id,
          second.id,
        ]);
        expect(identities.map((value) => value.agentId)).toEqual([
          first.agentId,
          second.agentId,
        ]);
        const read = await fetch(
          `${one.getState().url}/workspace/read?path=computer.txt`,
        );
        expect(read.status).toBe(200);
        expect(await read.json()).toMatchObject({ content: "before" });
        const writeBody = {
          path: "computer.txt",
          expectedContent: "before",
          content: "after",
        };
        const deniedWrite = await fetch(
          `${two.getState().url}/workspace/write`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(writeBody),
          },
        );
        expect(deniedWrite.status).toBe(404);
        const approvedWrite = await fetch(
          `${one.getState().url}/workspace/write`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(writeBody),
          },
        );
        expect(approvedWrite.status).toBe(200);
        const submitOfflineRun = async (
          backend: BackendManager,
          botId: string,
          label: string,
        ) => {
          const sessionId = `session-${label}`;
          const runId = `run-${label}`;
          registry.bindConversation(botId, sessionId);
          const state = backend.getState();
          const submitted = await fetch(`${state.url}/chat/runs`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              runId,
              roomId: sessionId,
              message: `Offline ${label}`,
              source: "desktop",
              workspaceDir: workspace,
            }),
          });
          expect(submitted.status).toBe(202);
          const receipt = (await submitted.json()) as {
            run_id: string;
            bot_id: string;
          };
          expect(receipt).toMatchObject({ run_id: runId, bot_id: botId });
          registry.bindRun(botId, sessionId, runId);
          const deadline = Date.now() + 20_000;
          while (Date.now() < deadline) {
            const response = await fetch(`${state.url}/chat/runs/${runId}`);
            const payload = (await response.json()) as {
              run: {
                runId: string;
                sessionId: string;
                botId: string;
                status: string;
              };
            };
            expect(payload.run).toMatchObject({ runId, sessionId, botId });
            if (
              ["complete", "cancelled", "error"].includes(payload.run.status)
            ) {
              return { runId, sessionId, status: payload.run.status };
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 100));
          }
          throw new Error("Offline child did not finish its run.");
        };
        const completed = await Promise.all([
          submitOfflineRun(one, first.id, "one"),
          submitOfflineRun(two, second.id, "two"),
        ]);
        expect(completed.map((row) => row.status)).toEqual([
          "complete",
          "complete",
        ]);
        for (const [backend, bot, run] of [
          [one, first, completed[0]],
          [two, second, completed[1]],
        ] as const) {
          const state = backend.getState();
          const list = await fetch(`${state.url}/chat/runs?limit=10`);
          const payload = (await list.json()) as {
            runs: Array<{ runId: string; botId: string }>;
          };
          expect(
            payload.runs.find((row) => row.runId === run.runId)?.botId,
          ).toBe(bot.id);
          const transcript = await fetch(
            `${state.url}/sessions/messages?sessionId=${run.sessionId}&throughRunId=${run.runId}`,
          );
          expect(transcript.status).toBe(200);
          const history = (await transcript.json()) as {
            messages: Array<{ role: string; text: string }>;
          };
          expect(
            history.messages.some(
              (row) => row.role === "user" && row.text.includes("Offline"),
            ),
          ).toBe(true);
        }
        const acpRequest = {
          requestId: "acp-one",
          botId: first.id,
          method: "POST" as const,
          path: "/acp/session/new",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            originConversationId: "session-one",
            cwd: workspace,
            mcpServers: [],
            _meta: { "doolittle/editor-context": true },
          }),
        };
        const initializedAcp = await fetch(
          `${one.getState().url}/acp/initialize`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              originConversationId: "session-one",
              workspacePath: workspace,
            }),
          },
        );
        expect(initializedAcp.status).toBe(200);
        await assertBotSessionRequest(registry, acpRequest, first.id);
        const acpResponse = await fetch(
          `${one.getState().url}/acp/session/new`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: acpRequest.body,
          },
        );
        expect(acpResponse.status, await acpResponse.clone().text()).toBe(200);
        const attributedAcp = await attributeBotSessionResponse(
          registry,
          acpRequest,
          first.id,
          {
            status: 200,
            statusText: "OK",
            headers: {},
            body: await acpResponse.text(),
          },
        );
        const acpSessionId = (
          JSON.parse(attributedAcp.body) as {
            session: { sessionId: string; botId: string };
          }
        ).session.sessionId;
        expect(
          registry.assertAcpSessionOwner(first.id, acpSessionId)
            .originConversationId,
        ).toBe("session-one");
        await expect(
          assertBotSessionRequest(
            registry,
            {
              ...acpRequest,
              botId: second.id,
              path: "/acp/editor/context",
              body: JSON.stringify({
                sessionId: acpSessionId,
                activeFile: "index.ts",
              }),
            },
            second.id,
          ),
        ).rejects.toThrow(/another bot/iu);
        expect(registry.dataDirectory(first.id)).not.toBe(
          registry.dataDirectory(second.id),
        );
        const firstHost = configurations[0]?.workerHostHandler;
        const secondHost = configurations[1]?.workerHostHandler;
        expect(firstHost && secondHost).toBeTruthy();
        const signal = new AbortController().signal;
        const firstClaim = (await firstHost?.(
          {
            operation: "execution.claim",
            payload: {
              runId: "run-one",
              sessionId: "session-one",
              kind: "automatic-acp",
            },
          },
          signal,
        )) as { accepted: boolean; leaseId?: string };
        const secondClaim = (await secondHost?.(
          {
            operation: "execution.claim",
            payload: {
              runId: "run-two",
              sessionId: "session-two",
              kind: "automatic-acp",
            },
          },
          signal,
        )) as { accepted: boolean; leaseId?: string };
        expect(firstClaim.accepted).toBe(true);
        expect(secondClaim.accepted).toBe(true);
        expect(
          await firstHost?.(
            {
              operation: "execution.claim",
              payload: {
                runId: "run-three",
                sessionId: "session-three",
                kind: "automatic-acp",
              },
            },
            signal,
          ),
        ).toEqual({ accepted: false, reason: "automatic_acp_limit" });
        expect(
          await firstHost?.(
            {
              operation: "execution.release",
              payload: { runId: "run-one", leaseId: secondClaim.leaseId },
            },
            signal,
          ),
        ).toEqual({ released: false });
        expect(admission.list()).toHaveLength(2);
        await registry.stop(first.id);
        expect(admission.list()).toHaveLength(1);
        await registry.activate(first.id);
        const restarted = await registry.backendFor(first.id);
        const restartedState = restarted.getState();
        const persisted = await fetch(
          `${restartedState.url}/sessions/messages?sessionId=session-one&throughRunId=run-one`,
        );
        expect(persisted.status).toBe(200);
        const persistedHistory = (await persisted.json()) as {
          messages: Array<{ role: string; text: string }>;
        };
        expect(
          persistedHistory.messages.some(
            (row) => row.role === "user" && row.text.includes("Offline one"),
          ),
        ).toBe(true);
        const restartedRuns = await fetch(
          `${restartedState.url}/chat/runs?limit=10`,
        );
        const restartedPayload = (await restartedRuns.json()) as {
          runs: Array<{ runId: string; botId: string }>;
        };
        expect(
          restartedPayload.runs.find((row) => row.runId === "run-one")?.botId,
        ).toBe(first.id);
      } finally {
        await registry.stopAll();
        expect(admission.list()).toHaveLength(0);
        rmSync(directory, { recursive: true, force: true });
      }
    }, 120_000);
  },
);
