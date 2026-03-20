import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EnvConfig, GatewayConfig } from "@/types";
import { DiagnosticsService } from "./diagnostics-service";

function buildConfig(root: string): EnvConfig {
  const dataDir = join(root, ".eliza-agent");
  const skillsDir = join(root, "skills");
  const cronOutputDir = join(dataDir, "cron-output");
  const gatewayDataDir = join(dataDir, "gateway");
  const hooksDir = join(dataDir, "hooks");
  const workspaceDir = root;
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(cronOutputDir, { recursive: true });
  mkdirSync(gatewayDataDir, { recursive: true });
  mkdirSync(hooksDir, { recursive: true });

  return {
    agentName: "Eliza Agent",
    mode: "cli",
    host: "127.0.0.1",
    port: 3000,
    dataDir,
    skillsDir,
    timezone: "America/Chicago",
    openAiApiKey: undefined,
    openAiBaseUrl: "https://api.openai.com/v1",
    openAiModel: "gpt-4.1-mini",
    openAiTemperature: 0.4,
    openAiMaxTokens: 1200,
    anthropicApiKey: undefined,
    anthropicBaseUrl: undefined,
    anthropicSmallModel: "claude-3-5-haiku-20241022",
    anthropicLargeModel: "claude-sonnet-4-20250514",
    telegramBotToken: undefined,
    telegramApiRoot: undefined,
    telegramAllowedChats: undefined,
    discordBotToken: undefined,
    slackWebhookUrl: undefined,
    slackSigningSecret: undefined,
    whatsappAccessToken: undefined,
    whatsappPhoneNumberId: undefined,
    whatsappVerifyToken: undefined,
    signalCliCommand: undefined,
    matrixHomeserver: undefined,
    matrixAccessToken: undefined,
    emailSendCommand: undefined,
    smsSendCommand: undefined,
    mattermostUrl: undefined,
    mattermostToken: undefined,
    homeAssistantUrl: undefined,
    homeAssistantToken: undefined,
    dingtalkWebhookUrl: undefined,
    dingtalkAccessToken: undefined,
    browserProvider: "lightpanda",
    browserCommand: "lightpanda",
    browserCdpUrl: undefined,
    browserObeyRobots: true,
    remoteSyncMode: "mirror",
    remoteSyncInclude: ["**/*"],
    remoteSyncExclude: [".git", ".eliza-agent", "node_modules"],
    remoteArtifactPaths: [
      ".eliza-agent/remote-artifacts",
      ".eliza-agent/trajectories",
      ".eliza-agent/cron-output",
    ],
    remoteArtifactPolicy: "metadata-only",
    remoteWorkspaceLabel: "eliza-agent-workspace",
    executionBackend: "docker",
    dockerImage: "oven/bun:latest",
    dockerNetwork: "host",
    dockerWorkspacePath: "/workspace",
    dockerEnvPassthrough: ["PATH"],
    singularityImage: "",
    daytonaTarget: undefined,
    daytonaCommand: undefined,
    daytonaShell: "/bin/sh",
    daytonaWorkspacePath: "/workspace",
    daytonaSnapshot: undefined,
    daytonaBootstrapCommand: undefined,
    daytonaStatusCommand: undefined,
    daytonaInspectCommand: undefined,
    modalTarget: undefined,
    modalCommand: undefined,
    modalShell: "/bin/bash",
    modalWorkspacePath: "/workspace",
    modalEnvironment: undefined,
    modalBootstrapCommand: undefined,
    modalStatusCommand: undefined,
    modalInspectCommand: undefined,
    executionCommandTimeoutMs: 30000,
    executionHealthTimeoutMs: 5000,
    containerCpuLimit: "2",
    containerMemoryLimit: "2g",
    containerPidsLimit: 256,
    containerReadOnlyRoot: true,
    sshHost: undefined,
    sshUser: undefined,
    sshPath: undefined,
    sshPort: 22,
    sshKeyPath: undefined,
    sshStrictHostKeyChecking: false,
    mcpServerCommand: undefined,
    mcpTimeoutMs: 10000,
    acpServerCommand: undefined,
    acpTimeoutMs: 10000,
    memoryCharLimit: 2200,
    userCharLimit: 1375,
    sessionSearchLimit: 6,
    cronTickSeconds: 30,
    cronOutputDir,
    gatewayDataDir,
    hooksDir,
    workspaceDir,
    allowAllUsers: false,
    pairingDefaultMode: "pair",
  };
}

function buildGatewayConfig(): GatewayConfig {
  return {
    allowAllUsers: false,
    sessionTimeoutMinutes: 120,
    mirrorResponsesToHistory: true,
    platforms: {
      telegram: { enabled: false, allowedUserIds: [] },
      discord: { enabled: false, allowedUserIds: [] },
      slack: { enabled: false, allowedUserIds: [] },
      whatsapp: { enabled: false, allowedUserIds: [] },
      signal: { enabled: false, allowedUserIds: [] },
      matrix: { enabled: false, allowedUserIds: [] },
      email: { enabled: false, allowedUserIds: [] },
      sms: { enabled: false, allowedUserIds: [] },
      mattermost: { enabled: false, allowedUserIds: [] },
      homeassistant: { enabled: false, allowedUserIds: [] },
      dingtalk: { enabled: false, allowedUserIds: [] },
      api: { enabled: false, allowedUserIds: [] },
      cli: { enabled: true, allowedUserIds: [] },
    },
  };
}

describe("DiagnosticsService", () => {
  it("reports richer operator checks and setup checklist hints", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-diagnostics-"));
    const service = new DiagnosticsService(
      buildConfig(root),
      buildGatewayConfig(),
    );

    try {
      const checks = await service.run({
        skillsCount: 2,
        contextFilesCount: 1,
        recentCronRuns: 0,
        recentTerminalCommands: 0,
        repositoryAvailable: true,
      });

      expect(checks.some((check) => check.id === "data.exists")).toBe(true);
      expect(checks.some((check) => check.id === "cron.output")).toBe(true);
      expect(checks.some((check) => check.id === "gateway.data")).toBe(true);
      expect(checks.some((check) => check.id === "execution.remote.sync")).toBe(
        true,
      );
      expect(
        checks.some((check) => check.id === "execution.remote.artifacts"),
      ).toBe(true);
      expect(
        checks.some(
          (check) => check.id === "mcp.bridge" && check.status === "warn",
        ),
      ).toBe(true);

      const checklist = await service.setupChecklist();
      expect(
        checklist.some((item) => item.includes("MCP_SERVER_COMMAND")),
      ).toBe(true);
      expect(
        checklist.some((item) =>
          item.includes("ELIZA_AGENT_REMOTE_SYNC_INCLUDE"),
        ),
      ).toBe(true);
      expect(
        checklist.some((item) =>
          item.includes("Validate docker runtime access"),
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
