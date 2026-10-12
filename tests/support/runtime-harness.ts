import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AutomationJobRecord } from "@doolittle/contracts";
import {
  BackendManager,
  sourceRuntimeTarget,
} from "../../apps/desktop/src/main/backend";
import { BotProcessRegistry } from "../../apps/desktop/src/main/bot-process-registry";
import { DesktopExecutionAdmission } from "../../apps/desktop/src/main/execution-admission";
import { releaseAbandonedExecutionClaim } from "../../apps/desktop/src/main/execution-receipt";
import { isolatedRuntimeEnvironment } from "./isolated-runtime-environment";

const repoRoot = realpathSync(
  fileURLToPath(new URL("../../", import.meta.url)),
);

function endpoint(raw: string | undefined): string {
  if (!raw || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/u.test(raw))
    throw new Error("Runtime did not return a private loopback endpoint.");
  return raw;
}

export async function runtimeHarness() {
  const root = realpathSync(
    mkdtempSync(resolve(tmpdir(), "doolittle-runtime-acceptance-")),
  );
  const leadData = resolve(root, "lead-data");
  const catalogData = resolve(root, "catalog-data");
  const leadWorkspace = resolve(root, "lead-workspace");
  const workspaces = ["a", "b"].map((name) =>
    resolve(root, `workspace-${name}`),
  );
  for (const path of [leadData, catalogData, leadWorkspace, ...workspaces])
    mkdirSync(path, { recursive: true, mode: 0o700 });
  workspaces.forEach((path, index) => {
    writeFileSync(resolve(path, "scope.txt"), `scope-${index}`);
  });
  const target = sourceRuntimeTarget(repoRoot);
  const admission = new DesktopExecutionAdmission({ maxConcurrent: 1 });
  const jobs: AutomationJobRecord[] = [];
  let lead: BackendManager;
  // Desktop cron listing is a fixture; dispatch, receipt and SDK worker stay real.
  const runtimeFetch: typeof fetch = async (input, init) => {
    if (String(input) === `${lead.getState().url}/cron/jobs`)
      return Response.json({ jobs });
    return fetch(input, init);
  };
  const isolatedEnvironment = isolatedRuntimeEnvironment(leadData);
  // No host credentials, profile or inherited provider configuration enter the child.
  lead = new BackendManager(target, leadData, leadWorkspace, runtimeFetch, {
    sharedEngine: true,
    hostRpcBotId: "default",
    isolatedEnvironment,
    workerHostHandler: async (request, signal) => {
      if (request.operation === "workspace.resolve") {
        const payload = request.payload as { sessionId?: unknown } | null;
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
        throw new Error("Unapproved host operation.");
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
    {
      admission,
      runtimeFetch,
      confirmAutomation: async () => true,
    },
  );
  const shutdown = async () => {
    const errors: unknown[] = [];
    try {
      await registry.stopAll();
    } catch (error) {
      errors.push(error);
    }
    try {
      await lead.stop();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length)
      throw new AggregateError(
        errors,
        `Runtime shutdown failed; fixture retained at ${root}`,
      );
    rmSync(root, { recursive: true, force: true });
  };
  try {
    const state = await lead.start();
    if (state.phase !== "ready")
      throw new Error(`Offline source runtime failed: ${state.detail}`);
    const leadUrl = endpoint(state.url);
    const projects = [];
    for (const [index, path] of workspaces.entries()) {
      const response = await fetch(`${leadUrl}/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `Acceptance ${index}`,
          primaryPath: path,
        }),
      });
      if (response.status !== 201)
        throw new Error(`Project creation failed: ${await response.text()}`);
      const body = (await response.json()) as { project: { id: string } };
      projects.push(await registry.readLeadProject(body.project.id));
    }
    const botA = registry.create({
      name: "Acceptance Alpha",
      persona: "Offline scoped bot Alpha.",
      model: { provider: "offline", model: "offline" },
      permissions: { allowMutation: true, toolIds: ["DOOLITTLE_COMMAND"] },
    });
    const botB = registry.create({
      name: "Acceptance Beta",
      persona: "Offline scoped bot Beta.",
      model: { provider: "offline", model: "offline" },
    });
    const sessionA = `session-${randomUUID()}`;
    const sessionB = `session-${randomUUID()}`;
    const sessionOther = `session-${randomUUID()}`;
    registry.bindConversationWorkspace(botA.id, sessionA, projects[0]);
    registry.bindConversationWorkspace(botA.id, sessionB, projects[1]);
    registry.bindConversationWorkspace(botB.id, sessionOther, projects[1]);
    const [backendA, backendB] = await Promise.all([
      registry.backendFor(botA.id),
      registry.backendFor(botB.id),
    ]);
    const urls = [
      endpoint(backendA.getState().url),
      endpoint(backendB.getState().url),
    ] as const;
    return {
      root,
      workspaces,
      projects,
      leadUrl,
      registry,
      admission,
      jobs,
      bots: [botA, botB] as const,
      sessions: [sessionA, sessionB, sessionOther] as const,
      urls,
      close: shutdown,
    };
  } catch (error) {
    try {
      await shutdown();
    } catch (shutdownError) {
      throw new AggregateError(
        [error, shutdownError],
        "Runtime startup and shutdown failed.",
      );
    }
    throw error;
  }
}
