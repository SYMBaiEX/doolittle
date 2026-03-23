import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { AwarenessService } from "./awareness-service";
import type { AppServices } from "./index";
import { RunControllerService } from "./run-controller-service";
import type { RuntimeSettings } from "./settings-service";
import { SettingsService } from "./settings-service";
import { StartupStateService } from "./startup-state-service";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createDefaults(): RuntimeSettings {
  return {
    model: {
      provider: "elizacloud",
      model: "anthropic/claude-sonnet-4.6",
      baseUrl: "https://www.elizacloud.ai/api/v1",
      temperature: 0.4,
      maxTokens: 1200,
    },
    gateway: {
      sessionTimeoutMinutes: 120,
      mirrorResponsesToHistory: true,
    },
    execution: {
      backend: "local",
      remoteSyncMode: "mirror",
      remoteSyncInclude: ["**/*"],
      remoteSyncExclude: [".git", "node_modules"],
      remoteArtifactPaths: [".eliza-agent/remote-artifacts"],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "eliza-agent-workspace",
      dockerImage: "oven/bun:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: ["PATH"],
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
      modalShell: "/bin/bash",
      modalWorkspacePath: "/workspace",
      modalEnvironment: "",
      modalBootstrapCommand: "",
      modalStatusCommand: "",
      modalInspectCommand: "",
      commandTimeoutMs: 30_000,
      healthTimeoutMs: 5_000,
      containerCpuLimit: "2",
      containerMemoryLimit: "2g",
      containerPidsLimit: 256,
      containerReadOnlyRoot: true,
      sshHost: "",
      sshUser: "",
      sshPath: "",
      sshPort: 22,
      sshKeyPath: "",
      sshStrictHostKeyChecking: false,
    },
    mcp: {
      serverCommand: "",
      timeoutMs: 10_000,
    },
    agent: {
      runDepth: "standard",
      maxIterations: 45,
      toolProgressMode: "new",
    },
    ui: {
      theme: "orange",
    },
  };
}

function createSettingsService(): SettingsService {
  const dir = mkdtempSync(join(tmpdir(), "eliza-agent-awareness-"));
  tempDirs.push(dir);
  return new SettingsService(dir, createDefaults());
}

function createServices(): AppServices {
  const runController = new RunControllerService();
  const startupState = new StartupStateService();
  startupState.markReady("runtime", "runtime ready");
  return {
    runController,
    startupState,
    settings: createSettingsService(),
  } as unknown as AppServices;
}

function createRuntime(): IAgentRuntime {
  return {
    agentId: "agent-1",
    character: {
      name: "Eliza Agent",
      bio: ["Operator"],
      advancedMemory: true,
      advancedPlanning: true,
    },
    plugins: [{ id: "a" }, { id: "b" }],
  } as unknown as IAgentRuntime;
}

describe("AwarenessService", () => {
  it("initializes once and composes truthful idle state", async () => {
    const services = createServices();
    const awareness = new AwarenessService();

    awareness.initialize(services);
    awareness.initialize(services);

    expect(awareness.isInitialized()).toBe(true);
    expect(awareness.contributorCount()).toBe(5);

    const summary = await awareness.composeSummary(createRuntime());
    expect(summary).toContain("[Self Status v1]");
    expect(summary).toContain("runtime ok");
    expect(summary).toContain("run=idle");
    expect(summary).toContain("startup hot=ready");
    expect(summary).toContain("depth=standard");
    expect(summary).toContain("memory=adv");
  });

  it("reports active run details instead of budget state", async () => {
    const services = createServices();
    services.runController.startTurn({
      sessionId: "session-1",
      roomId: "room-1",
      runId: "run-1",
      source: "cli",
      message: "search the repo",
      runDepth: "deep",
      configuredMaxIterations: 90,
      progressMode: "all",
    });
    services.runController.noteActionStarted("session-1", "workspace.search");

    const awareness = new AwarenessService();
    awareness.initialize(services);

    const detail = await awareness
      .getRegistry()
      ?.getDetail(createRuntime(), "run", "full");

    expect(detail).toContain("Status: acting");
    expect(detail).toContain("Run depth: deep");
    expect(detail).toContain("Observed actions: 1");
    expect(detail).not.toContain("Budget(");
  });
});
