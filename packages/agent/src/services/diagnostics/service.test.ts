import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeLike } from "@/runtime/native/service-bridge/runtime";
import type { EnvConfig, GatewayConfig } from "@/types";
import { DiagnosticsService } from "./index";

function buildConfig(root: string): EnvConfig {
  const dataDir = join(root, ".doolittle");
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
    agentName: "Doolittle",
    mode: "cli",
    host: "127.0.0.1",
    port: 3000,
    dataDir,
    skillsDir,
    timezone: "America/Chicago",
    elizaCloudApiKey: undefined,
    elizaCloudEnabled: false,
    elizaCloudBaseUrl: "https://www.elizacloud.ai/api/v1",
    elizaCloudSmallModel: "anthropic/claude-haiku-4-5-20251001",
    elizaCloudLargeModel: "anthropic/claude-sonnet-4.6",
    elizaCloudEmbeddingModel: "openai/text-embedding-3-small",
    openAiApiKey: undefined,
    offlineBootstrapMode: false,
    useLinkedCodexAuth: false,
    openAiBaseUrl: "https://api.openai.com/v1",
    openAiModel: "gpt-4.1-mini",
    openAiTemperature: 0.4,
    openAiMaxTokens: 1200,
    anthropicApiKey: undefined,
    useLinkedClaudeCodeAuth: false,
    claudeCodeCliFallback: false,
    anthropicBaseUrl: undefined,
    anthropicSmallModel: "claude-haiku-4-5-20251001",
    anthropicLargeModel: "claude-sonnet-4.6",
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
    falApiKey: undefined,
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
    remoteSyncExclude: [".git", ".doolittle", "node_modules"],
    remoteArtifactPaths: [
      ".doolittle/remote-artifacts",
      ".doolittle/trajectories",
      ".doolittle/cron-output",
    ],
    remoteArtifactPolicy: "metadata-only",
    remoteWorkspaceLabel: "doolittle-workspace",
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
    runDepth: "standard",
    toolProgressMode: "new",
    maxIterations: 30,
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
    const root = mkdtempSync(join(tmpdir(), "doolittle-diagnostics-"));
    const service = new DiagnosticsService(
      buildConfig(root),
      buildGatewayConfig(),
    );
    const runtime = {
      getService(name: string) {
        if (name === "plugin_manager") {
          return {
            list: () => [
              {
                id: "messaging.telegram",
                enabled: true,
                source: "official",
              },
              {
                id: "messaging.discord",
                enabled: false,
                source: "vendored",
              },
            ],
            categories: () => ({
              messaging: ["messaging.telegram", "messaging.discord"],
            }),
            summary: () => ({
              total: 2,
              enabled: 1,
              official: 1,
              vendored: 1,
              categories: 1,
            }),
          };
        }
        if (name === "discord_transport") {
          return {
            history: () => [],
          };
        }
        if (name === "memoryStorage") {
          return {
            getSessionSummaries: () => [],
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;
    service.attachRuntime(runtime);

    try {
      const checks = await service.run({
        skillsCount: 2,
        contextFilesCount: 1,
        recentCronRuns: 0,
        recentTerminalCommands: 0,
        repositoryAvailable: true,
        gatewayTransportOverview: {
          mismatchCount: 1,
          operationalCount: 1,
          details: [
            {
              platform: "telegram",
              mismatchFlags: ["health-ready-mismatch"],
              inventory: { detail: "Telegram is ready." },
              platformState: { detail: "Telegram state is pending." },
            },
          ],
        },
      });

      expect(checks.some((check) => check.id === "data.exists")).toBe(true);
      expect(checks.some((check) => check.id === "onboarding.summary")).toBe(
        true,
      );
      expect(checks.some((check) => check.id === "onboarding.native")).toBe(
        true,
      );
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
      expect(
        checks.some((check) => check.id === "native.messaging.control-plane"),
      ).toBe(true);
      expect(checks.some((check) => check.id === "runtime.agent-events")).toBe(
        true,
      );
      expect(checks.some((check) => check.id === "runtime.awareness")).toBe(
        true,
      );
      expect(
        checks.some(
          (check) =>
            check.id === "runtime.memory-storage" && check.status === "pass",
        ),
      ).toBe(true);
      expect(checks.some((check) => check.id === "autonomous.connection")).toBe(
        true,
      );
      expect(
        checks.some(
          (check) =>
            check.id === "autonomous.connection" &&
            check.status === "warn" &&
            check.detail.includes("missing"),
        ),
      ).toBe(true);
      expect(
        checks.some(
          (check) =>
            check.id === "native.messaging.control-plane" &&
            check.detail.includes("operational=") &&
            check.detail.includes("custom=") &&
            check.detail.includes("product="),
        ),
      ).toBe(true);
      expect(checks.some((check) => check.id === "native.plugin-manager")).toBe(
        true,
      );
      expect(
        checks.some(
          (check) =>
            check.id === "native.plugin-manager" &&
            check.detail.includes("total=2") &&
            check.detail.includes("official=1") &&
            check.detail.includes("vendored=1"),
        ),
      ).toBe(true);
      expect(
        checks.some((check) => check.id === "gateway.transport.inventory"),
      ).toBe(true);
      expect(
        checks.some(
          (check) =>
            check.id === "provider.elizacloud-base-url" &&
            check.detail.includes("https://www.elizacloud.ai/api/v1"),
        ),
      ).toBe(true);
      expect(
        checks.some(
          (check) =>
            check.id === "gateway.transport.inventory" &&
            check.detail.length > 0,
        ),
      ).toBe(true);
      expect(
        checks.some(
          (check) =>
            check.id === "gateway.transport.overview" &&
            check.status === "warn" &&
            check.detail.includes("mismatches=1"),
        ),
      ).toBe(true);

      const checklist = await service.setupChecklist();
      expect(
        checklist.some((item) => item.includes("MCP_SERVER_COMMAND")),
      ).toBe(true);
      expect(
        checklist.some((item) =>
          item.includes("DOOLITTLE_REMOTE_SYNC_INCLUDE"),
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
