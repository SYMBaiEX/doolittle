import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type BackendLaunchTarget,
  BackendManager,
  sourceRuntimeTarget,
} from "./backend";
import { BotProcessRegistry } from "./bot-process-registry";
import { EngineBotBackend } from "./engine-bot-backend";
import { DesktopExecutionAdmission } from "./execution-admission";
import { releaseAbandonedExecutionClaim } from "./execution-receipt";

type ReadyBot = {
  getState(): { url?: string; agentId?: string; phase: string };
};

/** Use staged app Resources/runtime, never the bin-only prepare output. */
function testRuntimeTarget(): BackendLaunchTarget {
  const configured = process.env.DOOLITTLE_SHARED_ENGINE_E2E_RUNTIME_ROOT;
  if (!configured) return sourceRuntimeTarget(process.cwd());
  if (!isAbsolute(configured))
    throw new Error("Shared-engine e2e runtime root must be absolute.");
  const runtimeRoot = realpathSync(configured);
  const entry = resolve(runtimeRoot, "bin", "doolittle-runtime.mjs");
  const manifest = resolve(runtimeRoot, "bin", "runtime-manifest.json");
  const skills = resolve(runtimeRoot, "packages", "skills");
  if (!existsSync(entry) || !existsSync(manifest) || !existsSync(skills))
    throw new Error(
      "Shared-engine e2e requires a staged app Resources/runtime root with bin and bundled skills.",
    );
  const electron = createRequire(import.meta.url)("electron") as unknown;
  if (
    typeof electron !== "string" ||
    !isAbsolute(electron) ||
    !existsSync(electron)
  )
    throw new Error(
      "Shared-engine e2e requires the installed Electron executable.",
    );
  return {
    executable: electron,
    args: [entry, "api"],
    repoRoot: runtimeRoot,
    environment: { ELECTRON_RUN_AS_NODE: "1" },
  };
}

function urlOf(bot: ReadyBot): string {
  const state = bot.getState();
  expect(state.phase).toBe("ready");
  expect(state.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
  if (!state.url) throw new Error("Shared engine URL was not returned.");
  return state.url;
}

async function jsonAt<T>(url: string): Promise<T> {
  const response = await fetch(url);
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json() as Promise<T>;
}

// Explicit opt-in: one actual source runtime child hosts two offline SDK
// runtimes in worker_threads. No provider credentials or host home are inherited.
describe.skipIf(process.env.DOOLITTLE_SHARED_ENGINE_E2E !== "1")(
  "shared engine offline boundary",
  () => {
    it("keeps two named bots independent across turns, stop, and restart", async () => {
      const target = testRuntimeTarget();
      const directory = mkdtempSync(
        resolve(tmpdir(), "doolittle-shared-engine-"),
      );
      const leadData = resolve(directory, "lead-data");
      const catalogData = resolve(directory, "catalog-data");
      const leadWorkspace = resolve(directory, "lead-workspace");
      const workspaceA = resolve(directory, "workspace-a");
      const workspaceB = resolve(directory, "workspace-b");
      for (const path of [
        leadData,
        catalogData,
        leadWorkspace,
        workspaceA,
        workspaceB,
      ])
        mkdirSync(path, { recursive: true, mode: 0o700 });

      const admission = new DesktopExecutionAdmission();
      const lead = new BackendManager(target, leadData, leadWorkspace, fetch, {
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
          DOOLITTLE_ENGINE_DIAGNOSTICS: "1",
          ...(target.environment?.ELECTRON_RUN_AS_NODE
            ? { ELECTRON_RUN_AS_NODE: target.environment.ELECTRON_RUN_AS_NODE }
            : {}),
        },
        workerHostHandler: async (request, signal) => {
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
          releaseAbandonedExecutionClaim(admission, "default", request, result),
      });
      const registry = new BotProcessRegistry(
        target,
        catalogData,
        lead,
        leadWorkspace,
        { admission },
      );
      try {
        const leadState = await lead.start();
        expect(leadState.phase, leadState.detail).toBe("ready");
        const first = registry.create({
          name: "Shared Engine One",
          persona: "You are the first offline test bot. Keep your own history.",
          workspacePath: workspaceA,
          model: { provider: "offline", model: "offline" },
        });
        const second = registry.create({
          name: "Shared Engine Two",
          persona:
            "You are the second offline test bot. Keep your own history.",
          workspacePath: workspaceB,
          model: { provider: "offline", model: "offline" },
        });
        const [botA, botB] = await Promise.all([
          registry.backendFor(first.id),
          registry.backendFor(second.id),
        ]).catch((error: unknown) => {
          const loggedBots = [first.id, second.id].filter((id) =>
            existsSync(
              resolve(catalogData, "bots", id, "logs", "doolittle.jsonl"),
            ),
          ).length;
          throw new Error(
            `Named SDK worker did not become ready; ${loggedBots} of 2 bot entrypoint logs exist.`,
            { cause: error },
          );
        });
        expect(botA).toBeInstanceOf(EngineBotBackend);
        expect(botB).toBeInstanceOf(EngineBotBackend);
        const [urlA, urlB] = [urlOf(botA), urlOf(botB)];
        expect(urlA).not.toBe(urlB);
        type RuntimeIdentity = {
          botId: string;
          agentId: string;
          processId: number;
          threadId: number;
        };
        const [leadIdentity, identityA, identityB] = await Promise.all([
          jsonAt<RuntimeIdentity>(`${urlOf(lead)}/runtime/bot-identity`),
          jsonAt<RuntimeIdentity>(`${urlA}/runtime/bot-identity`),
          jsonAt<RuntimeIdentity>(`${urlB}/runtime/bot-identity`),
        ]);
        for (const identity of [leadIdentity, identityA, identityB]) {
          expect(Number.isInteger(identity.processId)).toBe(true);
          expect(identity.processId).toBeGreaterThan(0);
          expect(Number.isInteger(identity.threadId)).toBe(true);
        }
        expect(leadIdentity.threadId).toBe(0);
        expect(identityA.threadId).toBeGreaterThan(0);
        expect(identityB.threadId).toBeGreaterThan(0);
        expect(identityA.threadId).not.toBe(identityB.threadId);
        expect(identityA.processId).toBe(leadIdentity.processId);
        expect(identityB.processId).toBe(leadIdentity.processId);
        expect(identityA).toMatchObject({
          botId: first.id,
          agentId: first.agentId,
        });
        expect(identityB).toMatchObject({
          botId: second.id,
          agentId: second.agentId,
        });
        expect(identityA.agentId).not.toBe(identityB.agentId);
        for (const [ownUrl, otherId] of [
          [urlA, second.id],
          [urlB, first.id],
        ]) {
          expect(
            (await fetch(`${ownUrl}/runtime/bots/${otherId}`)).status,
          ).toBe(404);
          expect(
            (
              await jsonAt<{ botId: string }>(
                `${ownUrl}/runtime/bot-identity?botId=${otherId}`,
              )
            ).botId,
          ).not.toBe(otherId);
        }

        const turn = async (
          botId: string,
          baseUrl: string,
          workspaceDir: string,
          marker: string,
        ) => {
          const sessionId = `session-${randomUUID()}`;
          const runId = `run-${randomUUID()}`;
          registry.bindConversation(botId, sessionId);
          const response = await fetch(`${baseUrl}/chat/runs`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              runId,
              roomId: sessionId,
              message: marker,
              source: "desktop",
              workspaceDir,
            }),
          });
          expect(response.status, await response.clone().text()).toBe(202);
          expect(await response.json()).toMatchObject({
            run_id: runId,
            bot_id: botId,
          });
          registry.bindRun(botId, sessionId, runId);
          const deadline = Date.now() + 30_000;
          while (Date.now() < deadline) {
            const payload = await jsonAt<{
              run: { runId: string; botId: string; status: string };
            }>(`${baseUrl}/chat/runs/${runId}`);
            expect(payload.run).toMatchObject({ runId, botId });
            if (
              ["complete", "cancelled", "error"].includes(payload.run.status)
            ) {
              expect(payload.run.status).toBe("complete");
              return { sessionId, runId };
            }
            await new Promise<void>((done) => setTimeout(done, 150));
          }
          throw new Error("Offline SDK turn did not finish within 30 seconds.");
        };
        const markerA = `Offline-A-${randomUUID()}`;
        const markerB = `Offline-B-${randomUUID()}`;
        const [runA, runB] = await Promise.all([
          turn(first.id, urlA, workspaceA, markerA),
          turn(second.id, urlB, workspaceB, markerB),
        ]);
        const history = async (
          baseUrl: string,
          sessionId: string,
          runId: string,
        ) =>
          jsonAt<{ messages: Array<{ role: string; text: string }> }>(
            `${baseUrl}/sessions/messages?sessionId=${sessionId}&throughRunId=${runId}`,
          );
        expect(
          (await history(urlA, runA.sessionId, runA.runId)).messages.some(
            (entry) => entry.role === "user" && entry.text.includes(markerA),
          ),
        ).toBe(true);
        expect(
          (await history(urlB, runB.sessionId, runB.runId)).messages.some(
            (entry) => entry.role === "user" && entry.text.includes(markerB),
          ),
        ).toBe(true);
        const bRuns = await jsonAt<{ runs: Array<{ runId: string }> }>(
          `${urlB}/chat/runs?limit=20`,
        );
        expect(bRuns.runs.some((entry) => entry.runId === runA.runId)).toBe(
          false,
        );

        await registry.stop(first.id);
        expect((await fetch(`${urlB}/health`)).status).toBe(200);
        expect(urlOf(await registry.backendFor(second.id))).toBe(urlB);
        const restartedA = await registry.backendFor(first.id);
        expect(
          await jsonAt<{ botId: string; agentId: string }>(
            `${urlOf(restartedA)}/runtime/bot-identity`,
          ),
        ).toMatchObject({ botId: first.id, agentId: first.agentId });
        expect(
          (
            await history(urlOf(restartedA), runA.sessionId, runA.runId)
          ).messages.some(
            (entry) => entry.role === "user" && entry.text.includes(markerA),
          ),
        ).toBe(true);
        expect((await fetch(`${urlB}/health`)).status).toBe(200);
        expect(
          (await history(urlB, runB.sessionId, runB.runId)).messages.some(
            (entry) => entry.role === "user" && entry.text.includes(markerB),
          ),
        ).toBe(true);
      } finally {
        try {
          await registry.stopAll();
        } finally {
          try {
            await lead.stop();
          } finally {
            rmSync(directory, { recursive: true, force: true });
          }
        }
      }
    }, 180_000);
  },
);
