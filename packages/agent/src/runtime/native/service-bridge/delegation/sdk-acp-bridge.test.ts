import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AcpService,
  agentOrchestratorPlugin,
} from "@elizaos/plugin-agent-orchestrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopAdmittedAcpService } from "@/runtime/native/desktop-admitted-acp";
import { runWithConversationWorkspace } from "@/runtime/workspace-scope";
import {
  executeEffectiveDelegationTask,
  retryEffectiveDelegationTask,
} from "./write";

const { hostRequest } = vi.hoisted(() => ({ hostRequest: vi.fn() }));
vi.mock("@/runtime/bootstrap/worker-host-rpc", () => ({
  requestWorkerHost: hostRequest,
}));

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  hostRequest.mockReset();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("installed SDK task to desktop ACP bridge", () => {
  it("admits SDK task metadata only for its verified task and exact workspace", async () => {
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    const directory = realpathSync(
      mkdtempSync(join(tmpdir(), "sdk-acp-bridge-")),
    );
    directories.push(directory);
    vi.stubEnv("ELIZA_ACP_STATE_DIR", directory);
    const scope = {
      sessionId: "chat-sdk",
      botId: "default",
      workspacePath: directory,
      projectId: "project-sdk",
    };
    let hostScope = scope;
    let switchScopeOnChildClaim = false;
    hostRequest.mockImplementation(
      async (operation: string, payload: Record<string, unknown>) => {
        if (operation === "workspace.resolve")
          return { ...hostScope, sessionId: payload.sessionId };
        if (operation === "execution.claim") {
          if (payload.kind === "automatic-acp" && switchScopeOnChildClaim) {
            hostScope = {
              ...scope,
              workspacePath: realpathSync(
                mkdtempSync(join(tmpdir(), "sdk-acp-revoked-")),
              ),
            };
            directories.push(hostScope.workspacePath);
            switchScopeOnChildClaim = false;
          }
          return { accepted: true, leaseId: randomUUID() };
        }
        return { released: true };
      },
    );

    let orchestrator: {
      createTask(input: unknown): Promise<{ id: string }>;
      getTask(id: string): Promise<unknown>;
    };
    let acp: DesktopAdmittedAcpService;
    const runtime = {
      character: { name: "Doolittle" },
      logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
      getSetting: () => undefined,
      getService: (name: string) =>
        name === "ACP_SUBPROCESS_SERVICE"
          ? acp
          : name === "ORCHESTRATOR_TASK_SERVICE"
            ? orchestrator
            : null,
    };
    acp = new DesktopAdmittedAcpService(runtime as never);
    const serviceClass = agentOrchestratorPlugin.services?.find(
      (candidate) => candidate.serviceType === "ORCHESTRATOR_TASK_SERVICE",
    );
    expect(serviceClass).toBeDefined();
    if (!serviceClass)
      throw new Error("Official SDK task service is unavailable.");
    orchestrator = (await serviceClass.start(
      runtime as never,
    )) as unknown as typeof orchestrator;
    let fixtureSession = 0;
    const spawn = vi
      .spyOn(AcpService.prototype, "spawnSession")
      .mockImplementation(async (options) => {
        if (typeof options.workdir !== "string")
          throw new Error("The ACP fixture requires an approved workspace.");
        return {
          id: `acp-fixture-${++fixtureSession}`,
          sessionId: `acp-fixture-${fixtureSession}`,
          agentType: options.agentType ?? "opencode",
          workdir: options.workdir,
          status: "ready",
          metadata: options.metadata,
        } as never;
      });
    const task = await orchestrator.createTask({
      title: "SDK bridge",
      goal: "Test the bridge",
      kind: "coding",
      metadata: { workspaceRoot: directory, doolittleWorkspaceScope: scope },
    });
    await runWithConversationWorkspace(scope, () =>
      executeEffectiveDelegationTask(runtime as never, undefined, task.id),
    );
    expect(spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        workdir: directory,
        metadata: expect.objectContaining({
          taskId: task.id,
          source: "orchestrator",
          doolittleParentRunId: expect.stringMatching(/^task:/),
        }),
      }),
    );
    expect(await orchestrator.getTask(task.id)).toMatchObject({
      sessions: [expect.objectContaining({ workdir: directory })],
    });
    expect(
      hostRequest.mock.calls
        .filter(([operation]) => operation === "execution.claim")
        .map(([, payload]) => payload.kind),
    ).toEqual(["foreground", "automatic-acp", "foreground"]);
    await runWithConversationWorkspace(scope, () =>
      retryEffectiveDelegationTask(runtime as never, undefined, task.id),
    );
    expect(await orchestrator.getTask(task.id)).toMatchObject({
      sessions: [
        expect.objectContaining({ workdir: directory }),
        expect.objectContaining({ workdir: directory }),
      ],
    });
    expect(spawn).toHaveBeenCalledTimes(2);
    switchScopeOnChildClaim = true;
    await expect(
      runWithConversationWorkspace(scope, () =>
        executeEffectiveDelegationTask(runtime as never, undefined, task.id),
      ),
    ).rejects.toThrow("no longer matches");
    expect(spawn).toHaveBeenCalledTimes(2);
    await expect(
      acp.spawnSession({
        workdir: directory,
        metadata: { taskId: task.id, source: "orchestrator" },
      }),
    ).rejects.toThrow("matching desktop run");
  });
});
