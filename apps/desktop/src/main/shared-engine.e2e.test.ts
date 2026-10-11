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
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

type LoopbackEndpoint = { readonly port: number };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function checkedId(value: string): string {
  if (!UUID.test(value)) throw new Error("The test bot identity is invalid.");
  return value;
}

function loopbackEndpoint(raw: string): LoopbackEndpoint {
  const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/u.exec(raw);
  const port = Number(match?.[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("The runtime did not provide a private loopback endpoint.");
  return { port };
}

function localUrl(
  endpoint: LoopbackEndpoint,
  pathname: string,
  search?: URLSearchParams,
): URL {
  const url = new URL("http://127.0.0.1/");
  url.port = String(endpoint.port);
  url.pathname = pathname;
  if (search) url.search = search.toString();
  return url;
}

async function localFetch(
  endpoint: LoopbackEndpoint,
  pathname: string,
  init?: RequestInit,
  search?: URLSearchParams,
): Promise<Response> {
  return fetch(localUrl(endpoint, pathname, search), {
    ...init,
    redirect: "error",
  });
}

/** Protect backend/registry health probes and control calls too. */
const runtimeFetch: typeof fetch = (async (
  input: RequestInfo | URL,
  init?: RequestInit,
) => {
  const requested = new URL(
    input instanceof Request ? input.url : String(input),
  );
  const endpoint = loopbackEndpoint(requested.origin);
  if (requested.username || requested.password || requested.hash)
    throw new Error("The runtime request URL is invalid.");
  const destination = localUrl(
    endpoint,
    requested.pathname,
    requested.searchParams,
  );
  const request =
    input instanceof Request ? new Request(destination, input) : destination;
  return fetch(request, { ...init, redirect: "error" });
}) as typeof fetch;

/** Use staged app Resources/runtime, never the bin-only prepare output. */
function testRuntimeTarget(): BackendLaunchTarget {
  const repoRoot = realpathSync(
    fileURLToPath(new URL("../../../../", import.meta.url)),
  );
  const mode = process.env.DOOLITTLE_SHARED_ENGINE_E2E_TARGET ?? "source";
  if (mode === "source") return sourceRuntimeTarget(repoRoot);
  if (
    mode !== "packaged" ||
    process.platform !== "darwin" ||
    process.arch !== "arm64"
  )
    throw new Error(
      "Shared-engine e2e target must be source or macOS arm64 packaged.",
    );
  const runtimeRoot = realpathSync(
    resolve(
      repoRoot,
      "apps",
      "desktop",
      "release",
      "mac-arm64",
      "Doolittle.app",
      "Contents",
      "Resources",
      "runtime",
    ),
  );
  const releaseRelative = relative(
    resolve(repoRoot, "apps", "desktop", "release"),
    runtimeRoot,
  );
  if (releaseRelative.startsWith("..") || isAbsolute(releaseRelative))
    throw new Error("Staged runtime escaped the repository release directory.");
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

function endpointOf(bot: ReadyBot): LoopbackEndpoint {
  const state = bot.getState();
  expect(state.phase).toBe("ready");
  if (!state.url) throw new Error("Shared engine URL was not returned.");
  return loopbackEndpoint(state.url);
}

async function jsonAt<T>(
  endpoint: LoopbackEndpoint,
  pathname: string,
  search?: URLSearchParams,
): Promise<T> {
  const response = await localFetch(endpoint, pathname, undefined, search);
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

      const admission = new DesktopExecutionAdmission({ maxConcurrent: 1 });
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
            DOOLITTLE_ENGINE_DIAGNOSTICS: "1",
            ...(target.environment?.ELECTRON_RUN_AS_NODE
              ? {
                  ELECTRON_RUN_AS_NODE: target.environment.ELECTRON_RUN_AS_NODE,
                }
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
        catalogData,
        lead,
        leadWorkspace,
        { admission, runtimeFetch },
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
        const firstId = checkedId(first.id);
        const secondId = checkedId(second.id);
        const [botA, botB] = await Promise.all([
          registry.backendFor(firstId),
          registry.backendFor(secondId),
        ]).catch((error: unknown) => {
          const loggedBots = [firstId, secondId].filter((id) =>
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
        const [endpointA, endpointB] = [endpointOf(botA), endpointOf(botB)];
        expect(endpointA.port).not.toBe(endpointB.port);
        type RuntimeIdentity = {
          botId: string;
          agentId: string;
          processId: number;
          threadId: number;
        };
        const [leadIdentity, identityA, identityB] = await Promise.all([
          jsonAt<RuntimeIdentity>(endpointOf(lead), "/runtime/bot-identity"),
          jsonAt<RuntimeIdentity>(endpointA, "/runtime/bot-identity"),
          jsonAt<RuntimeIdentity>(endpointB, "/runtime/bot-identity"),
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
          botId: firstId,
          agentId: first.agentId,
        });
        expect(identityB).toMatchObject({
          botId: secondId,
          agentId: second.agentId,
        });
        expect(identityA.agentId).not.toBe(identityB.agentId);
        for (const [ownUrl, otherId] of [
          [endpointA, secondId],
          [endpointB, firstId],
        ] as const) {
          expect(
            (
              await localFetch(
                ownUrl,
                `/runtime/bots/${encodeURIComponent(otherId)}`,
              )
            ).status,
          ).toBe(404);
          expect(
            (
              await jsonAt<{ botId: string }>(
                ownUrl,
                "/runtime/bot-identity",
                new URLSearchParams({ botId: otherId }),
              )
            ).botId,
          ).not.toBe(otherId);
        }

        const capacityBlocker = admission.claim({
          botId: "default",
          runId: "shared-engine-test-capacity",
          sessionId: "shared-engine-test-capacity",
          kind: "foreground",
        });
        if (!capacityBlocker.accepted)
          throw new Error(
            "The test capacity reservation could not be admitted.",
          );

        const turn = async (
          botId: string,
          endpoint: LoopbackEndpoint,
          workspaceDir: string,
          marker: string,
          verifyQueued = false,
        ) => {
          checkedId(botId);
          const sessionId = `session-${randomUUID()}`;
          const runId = `run-${randomUUID()}`;
          registry.bindConversation(botId, sessionId);
          const response = await localFetch(endpoint, "/chat/runs", {
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
          if (verifyQueued) {
            try {
              // Hold the sole execution seat so acceptance/status visibility
              // is deterministic, before any SDK model turn can begin.
              const queued = await jsonAt<{
                run: { runId: string; botId: string; status: string };
              }>(endpoint, `/chat/runs/${encodeURIComponent(runId)}`);
              expect(queued.run).toMatchObject({
                runId,
                botId,
                status: "waiting",
              });
              const listed = await jsonAt<{
                runs: Array<{ runId: string; status: string }>;
              }>(endpoint, "/chat/runs");
              expect(listed.runs).toContainEqual(
                expect.objectContaining({ runId, status: "waiting" }),
              );
            } finally {
              expect(
                admission.release({
                  botId: "default",
                  runId: "shared-engine-test-capacity",
                  leaseId: capacityBlocker.leaseId,
                }),
              ).toBe(true);
            }
          }
          const deadline = Date.now() + 30_000;
          while (Date.now() < deadline) {
            const payload = await jsonAt<{
              run: { runId: string; botId: string; status: string };
            }>(endpoint, `/chat/runs/${encodeURIComponent(runId)}`);
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
          turn(firstId, endpointA, workspaceA, markerA, true),
          turn(secondId, endpointB, workspaceB, markerB),
        ]);
        const history = async (
          endpoint: LoopbackEndpoint,
          sessionId: string,
          runId: string,
        ) =>
          jsonAt<{ messages: Array<{ role: string; text: string }> }>(
            endpoint,
            "/sessions/messages",
            new URLSearchParams({ sessionId, throughRunId: runId }),
          );
        expect(
          (await history(endpointA, runA.sessionId, runA.runId)).messages.some(
            (entry) => entry.role === "user" && entry.text.includes(markerA),
          ),
        ).toBe(true);
        expect(
          (await history(endpointB, runB.sessionId, runB.runId)).messages.some(
            (entry) => entry.role === "user" && entry.text.includes(markerB),
          ),
        ).toBe(true);
        const bRuns = await jsonAt<{ runs: Array<{ runId: string }> }>(
          endpointB,
          "/chat/runs",
          new URLSearchParams({ limit: "20" }),
        );
        expect(bRuns.runs.some((entry) => entry.runId === runA.runId)).toBe(
          false,
        );

        await registry.stop(firstId);
        expect((await localFetch(endpointB, "/health")).status).toBe(200);
        expect(endpointOf(await registry.backendFor(secondId)).port).toBe(
          endpointB.port,
        );
        const restartedA = await registry.backendFor(firstId);
        expect(
          await jsonAt<{ botId: string; agentId: string }>(
            endpointOf(restartedA),
            "/runtime/bot-identity",
          ),
        ).toMatchObject({ botId: firstId, agentId: first.agentId });
        expect(
          (
            await history(endpointOf(restartedA), runA.sessionId, runA.runId)
          ).messages.some(
            (entry) => entry.role === "user" && entry.text.includes(markerA),
          ),
        ).toBe(true);
        expect((await localFetch(endpointB, "/health")).status).toBe(200);
        expect(
          (await history(endpointB, runB.sessionId, runB.runId)).messages.some(
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
