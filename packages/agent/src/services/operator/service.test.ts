import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeLike } from "@/runtime/native/service-bridge/runtime";
import type { EnvConfig, GatewayConfig } from "@/types";
import { DiagnosticsService } from "../diagnostics/service";
import { RepositoryService } from "../repository-service";
import { OperatorService } from "./index";

const roots: string[] = [];

const gatewayConfig: GatewayConfig = {
  allowAllUsers: true,
  sessionTimeoutMinutes: 120,
  mirrorResponsesToHistory: true,
  platforms: {
    api: { enabled: true, allowAllUsers: true, allowedUserIds: [] },
    cli: { enabled: true, allowAllUsers: true, allowedUserIds: [] },
    telegram: { enabled: false, allowAllUsers: true, allowedUserIds: [] },
    discord: { enabled: false, allowAllUsers: true, allowedUserIds: [] },
    slack: { enabled: false, allowAllUsers: true, allowedUserIds: [] },
    whatsapp: { enabled: false, allowAllUsers: true, allowedUserIds: [] },
    signal: { enabled: false, allowAllUsers: true, allowedUserIds: [] },
    matrix: { enabled: false, allowAllUsers: true, allowedUserIds: [] },
    email: { enabled: false, allowAllUsers: true, allowedUserIds: [] },
    sms: { enabled: false, allowAllUsers: true, allowedUserIds: [] },
    mattermost: { enabled: false, allowAllUsers: true, allowedUserIds: [] },
    homeassistant: {
      enabled: false,
      allowAllUsers: true,
      allowedUserIds: [],
    },
    dingtalk: { enabled: false, allowAllUsers: true, allowedUserIds: [] },
  },
};

function makeConfig(root: string): EnvConfig {
  const dataDir = join(root, "data");
  const skillsDir = join(root, "skills");
  const gatewayDataDir = join(root, "gateway");
  const hooksDir = join(root, "hooks");
  const workspaceDir = join(root, "workspace");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(gatewayDataDir, { recursive: true });
  mkdirSync(hooksDir, { recursive: true });
  mkdirSync(workspaceDir, { recursive: true });
  return {
    agentName: "Doolittle",
    mode: "cli",
    host: "127.0.0.1",
    port: 3456,
    dataDir,
    skillsDir,
    timezone: "America/Chicago",
    elizaCloudApiKey: undefined,
    elizaCloudEnabled: false,
    elizaCloudBaseUrl: "https://www.elizacloud.ai/api/v1",
    elizaCloudSmallModel: "anthropic/claude-haiku-4-5-20251001",
    elizaCloudLargeModel: "anthropic/claude-sonnet-4.6",
    elizaCloudEmbeddingModel: "openai/text-embedding-3-small",
    openAiApiKey: "test-key",
    offlineBootstrapMode: false,
    useLinkedCodexAuth: false,
    openAiBaseUrl: "https://api.openai.com/v1",
    openAiModel: "gpt-5.4",
    openAiImageModel: "gpt-image-1",
    openAiTemperature: 0.2,
    openAiMaxTokens: 4096,
    anthropicApiKey: undefined,
    useLinkedClaudeCodeAuth: false,
    claudeCodeCliFallback: false,
    anthropicBaseUrl: undefined,
    anthropicSmallModel: "claude-haiku-4-5-20251001",
    anthropicLargeModel: "claude-sonnet-4.6",
    telegramBotToken: "telegram-token",
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
    browserProvider: "basic",
    browserCommand: "lightpanda",
    browserCdpUrl: undefined,
    browserObeyRobots: true,
    remoteSyncMode: "mirror",
    remoteSyncInclude: ["**/*"],
    remoteSyncExclude: [".git", ".doolittle"],
    remoteArtifactPaths: [".doolittle/remote-artifacts"],
    remoteArtifactPolicy: "metadata-only",
    remoteWorkspaceLabel: "doolittle-workspace",
    executionBackend: "local",
    dockerImage: "oven/bun:latest",
    dockerNetwork: "host",
    dockerWorkspacePath: "/workspace",
    dockerEnvPassthrough: [],
    singularityImage: "",
    daytonaTarget: undefined,
    daytonaCommand: undefined,
    daytonaShell: undefined,
    daytonaWorkspacePath: undefined,
    daytonaSnapshot: undefined,
    daytonaBootstrapCommand: undefined,
    daytonaStatusCommand: undefined,
    daytonaInspectCommand: undefined,
    modalTarget: undefined,
    modalCommand: undefined,
    modalShell: undefined,
    modalWorkspacePath: undefined,
    modalEnvironment: undefined,
    modalBootstrapCommand: undefined,
    modalStatusCommand: undefined,
    modalInspectCommand: undefined,
    executionCommandTimeoutMs: 120000,
    executionHealthTimeoutMs: 15000,
    containerCpuLimit: "2",
    containerMemoryLimit: "4g",
    containerPidsLimit: 512,
    containerReadOnlyRoot: false,
    sshHost: undefined,
    sshUser: undefined,
    sshPath: undefined,
    sshPort: 22,
    sshKeyPath: undefined,
    sshStrictHostKeyChecking: true,
    mcpServerCommand: undefined,
    mcpTimeoutMs: 30000,
    acpServerCommand: undefined,
    acpTimeoutMs: 30000,
    memoryCharLimit: 100000,
    userCharLimit: 50000,
    sessionSearchLimit: 20,
    cronTickSeconds: 30,
    cronOutputDir: join(root, "cron-output"),
    gatewayDataDir,
    hooksDir,
    workspaceDir,
    allowAllUsers: true,
    pairingDefaultMode: "allow",
    runDepth: "standard",
    toolProgressMode: "new",
    maxIterations: 30,
  };
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("OperatorService", () => {
  it("builds setup and update summaries", async () => {
    const base = join(tmpdir(), `doolittle-operator-${Date.now()}`);
    mkdirSync(base, { recursive: true });
    roots.push(base);
    const config = makeConfig(base);
    const diagnostics = new DiagnosticsService(config, gatewayConfig);
    const repository = new RepositoryService(config.workspaceDir);
    const service = new OperatorService(config, diagnostics, repository);
    const runtime = {
      getService(name: string) {
        if (name === "telegram") {
          return { bot: {}, messageManager: {}, knownChats: new Map() };
        }
        if (name === "discord_transport") {
          return { history: () => [] };
        }
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
                enabled: true,
                source: "vendored",
              },
            ],
            categories: () => ({
              messaging: ["messaging.telegram", "messaging.discord"],
            }),
            summary: () => ({
              total: 2,
              enabled: 2,
              official: 1,
              vendored: 1,
              categories: 1,
            }),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;
    service.attachRuntime(runtime);

    const setup = await service.setupSummary();
    const update = await service.updatePreview();

    expect(setup.version.name).toBe("doolittle");
    expect(setup.readiness.level).toBe("ready");
    expect(setup.readiness.headline).toContain("ready");
    expect(setup.readiness.nextSteps.length).toBeGreaterThan(0);
    expect(
      setup.providers.some((entry) => entry.id === "openai" && entry.ready),
    ).toBe(true);
    expect(setup.transports.some((entry) => !entry.ready)).toBe(true);
    if (setup.transportControl) {
      expect(typeof setup.transportControl.totals).toBe("object");
    }
    if (setup.transportInventory) {
      expect(setup.transportInventory.length).toBeGreaterThan(0);
    }
    expect(setup.pluginManager?.available).toBe(true);
    expect(setup.pluginManager?.total).toBeGreaterThan(0);
    expect(setup.pluginManager?.categories).toBeGreaterThan(0);
    expect(setup.transports.every((entry) => entry.detail.length > 0)).toBe(
      true,
    );
    expect(setup.checklist.length).toBeGreaterThan(0);
    expect(update.version.version).toBeTruthy();
    expect(update.readiness.level).not.toBe("blocked");
    expect(update.repositoryStatus.length).toBeGreaterThan(0);
    if (update.transportControl) {
      expect(typeof update.transportControl).toBe("object");
    }
    if (update.transportInventory) {
      expect(update.transportInventory.length).toBeGreaterThan(0);
    }
    expect(update.pluginManager?.enabled).toBeGreaterThan(0);
    expect(update.recommendedSteps.length).toBeGreaterThan(0);
  });

  it("inspects and applies a filesystem migration", () => {
    const base = join(tmpdir(), `doolittle-operator-migrate-${Date.now()}`);
    mkdirSync(base, { recursive: true });
    roots.push(base);
    const config = makeConfig(base);
    const diagnostics = new DiagnosticsService(config, gatewayConfig);
    const repository = new RepositoryService(config.workspaceDir);
    const service = new OperatorService(config, diagnostics, repository);

    const source = join(base, "legacy-source");
    mkdirSync(join(source, "skills", "sample-skill"), { recursive: true });
    writeFileSync(join(source, "AGENTS.md"), "# Imported guidance\n", "utf8");
    writeFileSync(join(source, "MEMORY.md"), "Remember this.\n", "utf8");
    writeFileSync(
      join(source, "skills", "sample-skill", "SKILL.md"),
      "# Skill\n",
      "utf8",
    );

    const inspection = service.inspectMigrationSource(source);
    expect(inspection.exists).toBe(true);
    expect(inspection.skillCount).toBe(1);

    const result = service.applyMigration(source);
    expect(
      result.importedFiles.some((entry) => entry.endsWith("AGENTS.md")),
    ).toBe(true);
    expect(
      result.importedSkills.some((entry) => entry.endsWith("sample-skill")),
    ).toBe(true);
    expect(result.reportPath).toContain("migration-");
    expect(service.migrationHistory(5)[0]?.reportPath).toBe(result.reportPath);
  });
});
