import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelType, type ResearchResult } from "@elizaos/core";
import { createCodingAgentServiceClass } from "@plugins/doolittle-plugin/coding-agent/service";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEffectiveDelegationTask,
  executeEffectiveDelegationTask,
  spawnEffectiveDelegationChild,
} from "@/runtime/native/service-bridge/delegation";
import type { RuntimeSettings } from "@/services/settings/runtime-settings";
import { TerminalService } from "@/services/terminal/service";
import { WorkspaceService } from "@/services/workspace-service";
import { createOfficialOrchestratorTestFixture } from "@/testing/official-orchestrator";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function localSettings(): RuntimeSettings {
  return {
    model: {
      provider: "offline",
      model: "local",
      baseUrl: "http://localhost",
      temperature: 0,
      maxTokens: 1,
    },
    gateway: { sessionTimeoutMinutes: 1, mirrorResponsesToHistory: false },
    execution: {
      backend: "local",
      remoteSyncMode: "mirror",
      remoteSyncInclude: [],
      remoteSyncExclude: [],
      remoteArtifactPaths: [],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "harness",
      dockerImage: "",
      dockerNetwork: "",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: [],
      singularityImage: "",
      daytonaTarget: "",
      daytonaCommand: "",
      daytonaShell: "/bin/sh",
      daytonaWorkspacePath: "/workspace",
      daytonaSnapshot: "",
      daytonaBootstrapCommand: "",
      daytonaStatusCommand: "",
      daytonaInspectCommand: "",
      modalTarget: "",
      modalCommand: "",
      modalShell: "/bin/sh",
      modalWorkspacePath: "/workspace",
      modalEnvironment: "",
      modalBootstrapCommand: "",
      modalStatusCommand: "",
      modalInspectCommand: "",
      commandTimeoutMs: 5_000,
      healthTimeoutMs: 5_000,
      containerCpuLimit: "1",
      containerMemoryLimit: "1g",
      containerPidsLimit: 64,
      containerReadOnlyRoot: true,
      sshHost: "",
      sshUser: "",
      sshPath: "",
      sshPort: 22,
      sshKeyPath: "",
      sshStrictHostKeyChecking: true,
    },
    mcp: { serverCommand: "", timeoutMs: 5_000 },
    agent: { runDepth: "standard", maxIterations: 1, toolProgressMode: "new" },
    ui: { theme: "orange" },
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "research-1",
    title: "Research official sources",
    kind: "research",
    status: "active",
    priority: "normal",
    paused: false,
    originalRequest: "Find primary sources",
    sessionCount: 0,
    activeSessionCount: 0,
    latestSessionId: null,
    latestWorkdir: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    closedAt: null,
    goal: "Find primary sources",
    parentTaskId: null,
    acceptanceCriteria: [],
    providerPolicy: null,
    metadata: {},
    sessions: [],
    messages: [],
    events: [],
    ...overrides,
  };
}

describe("research orchestration alpha harness", () => {
  it("keeps research capability, explicit framework, and account/session attribution durable", async () => {
    const createTask = vi.fn(async (input: Record<string, unknown>) =>
      task({
        id: input.parentTaskId ? "research-child" : "research-parent",
        title: input.title,
        goal: input.goal,
        originalRequest: input.originalRequest,
        parentTaskId: input.parentTaskId ?? null,
        providerPolicy: input.providerPolicy,
        metadata: input.metadata,
      }),
    );
    const runtime = {
      getService: () => ({ createTask }),
    };

    await createEffectiveDelegationTask(runtime as never, undefined, {
      title: "Research official sources",
      objective: "Find primary sources",
      capabilityProfile: "research",
      accountId: "account-alpha",
      sessionId: "session-alpha",
    });
    await spawnEffectiveDelegationChild(
      runtime as never,
      undefined,
      "research-parent",
      {
        title: "Verify source",
        objective: "Validate the cited source",
        capabilityProfile: "research",
        framework: "codex",
      },
    );

    expect(createTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: "research",
        providerPolicy: undefined,
        metadata: expect.objectContaining({
          capabilityProfile: "research",
          accountId: "account-alpha",
          sessionId: "session-alpha",
        }),
      }),
    );
    expect(createTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: "research",
        parentTaskId: "research-parent",
        providerPolicy: { preferredFramework: "codex" },
      }),
    );
  });

  it("executes an official research task through the durable research executor", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Research primary sources",
      goal: "What does the primary source say?",
      kind: "research",
    });
    const spawn = vi.spyOn(official.service, "spawnAgentForTask");
    const runtime = {
      ...official.runtime,
      getModel: (modelType: unknown) =>
        modelType === ModelType.RESEARCH
          ? () => Promise.resolve({})
          : undefined,
      useModel: vi.fn(async (modelType: unknown) => {
        expect(modelType).toBe(ModelType.RESEARCH);
        return {
          id: "research-receipt-1",
          text: "The primary source confirms the behavior.",
          annotations: [
            {
              url: "https://example.test/primary",
              title: "Primary source",
              startIndex: 0,
              endIndex: 1,
            },
            {
              url: "https://example.test/primary",
              title: "Duplicate",
              startIndex: 2,
              endIndex: 3,
            },
          ],
        } as ResearchResult;
      }),
    };

    const success = await executeEffectiveDelegationTask(
      runtime as never,
      undefined,
      created.id,
    );
    expect(success).toMatchObject({ status: "completed" });
    expect(spawn).not.toHaveBeenCalled();
    expect(runtime.useModel).toHaveBeenCalledWith(
      ModelType.RESEARCH,
      expect.anything(),
    );
    const durable = await official.service.getTask(created.id);
    expect(durable?.messages.at(-1)?.content).toContain("Sources:");
    expect(durable?.messages.at(-1)?.content).toContain(
      "https://example.test/primary",
    );
    expect(
      durable?.messages
        .at(-1)
        ?.content.match(/https:\/\/example\.test\/primary/g)?.length,
    ).toBe(1);
    expect(durable?.metadata).toMatchObject({
      researchRun: {
        status: "completed",
        sources: [{ url: "https://example.test/primary" }],
      },
    });
  });

  it("uses the real coding-agent service over a temp workspace and records a safe command receipt", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-research-alpha-"));
    temporaryDirectories.push(root);
    const workspace = new WorkspaceService(root);
    const terminal = new TerminalService(
      join(root, "data"),
      root,
      localSettings,
    );
    const CodingAgentService = createCodingAgentServiceClass({
      workspace,
      repository: {
        isRepository: () => false,
        status: async () => "not a repository",
        diffStat: async () => "",
        recentCommits: async () => "",
      },
      shell: terminal,
      inspectProject: async (path) => ({
        name: "alpha",
        path,
        type: "unknown",
        workspacePatterns: [],
        scripts: [],
        keyFolders: [],
        git: { available: false },
        topEntries: [],
      }),
      findCodebases: async () => [],
      resolveProjectTarget: () => undefined,
    });
    const service = (await CodingAgentService.start()) as unknown as {
      writeFile(path: string, content: string): Promise<{ bytes: number }>;
      read(path: string): string;
      patch(
        path: string,
        oldText: string,
        newText: string,
      ): Promise<{ replacements: number }>;
      search(
        query: string,
      ): Promise<Array<{ path: string; matches: string[] }>>;
      run(
        command: string,
      ): Promise<{ exitCode: number; stdout: string; command: string }>;
    };

    const written = await service.writeFile("src/alpha.txt", "TODO research\n");
    expect(written.bytes).toBe("TODO research\n".length);
    expect(service.read("src/alpha.txt")).toBe("TODO research\n");
    await expect(
      service.patch("src/alpha.txt", "TODO", "DONE"),
    ).resolves.toMatchObject({ replacements: 1 });
    expect(readFileSync(join(root, "src/alpha.txt"), "utf8")).toBe(
      "DONE research\n",
    );
    await expect(service.search("DONE")).resolves.toEqual([
      expect.objectContaining({
        path: "src/alpha.txt",
        matches: expect.arrayContaining([expect.stringContaining("DONE")]),
      }),
    ]);
    await expect(
      service.run("printf 'coding-alpha-ok'"),
    ).resolves.toMatchObject({
      command: "printf 'coding-alpha-ok'",
      exitCode: 0,
      stdout: "coding-alpha-ok",
    });
  });
});
