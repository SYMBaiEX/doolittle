import { existsSync, constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import {
  getLatestRuntimeLine,
  getNativePackageAudit,
} from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import {
  getNativeIntegrationControlPlane,
  getNativeOwnershipControlPlane,
  type RuntimeLike,
} from "@/runtime/native/service-bridge";
import type { DiagnosticCheck, EnvConfig, GatewayConfig } from "@/types";
import type { AgentSdkService } from "./agent-sdk-service";

function summarizeTransportInventory(
  inventory: Array<{
    platform: string;
    source: string;
    configEnabled: boolean;
    gatewayEnabled: boolean;
    operational: boolean;
    reason: string;
    detail: string;
  }>,
): string {
  const totals = {
    operational: inventory.filter((entry) => entry.operational).length,
    configEnabled: inventory.filter((entry) => entry.configEnabled).length,
    gatewayEnabled: inventory.filter((entry) => entry.gatewayEnabled).length,
    official: inventory.filter((entry) => entry.source === "official").length,
    vendored: inventory.filter((entry) => entry.source === "vendored").length,
    custom: inventory.filter((entry) => entry.source === "custom").length,
    product: inventory.filter((entry) => entry.source === "product").length,
  };

  return [
    `operational=${totals.operational}/${inventory.length} configured=${totals.configEnabled} gatewayEnabled=${totals.gatewayEnabled}`,
    `official=${totals.official} vendored=${totals.vendored} custom=${totals.custom} product=${totals.product}`,
    ...inventory.map(
      (entry) =>
        `${entry.platform}:source=${entry.source}:cfg=${entry.configEnabled ? "on" : "off"}:gateway=${entry.gatewayEnabled ? "on" : "off"}:live=${entry.operational ? "yes" : "no"}:${entry.reason}`,
    ),
  ].join(", ");
}

export class DiagnosticsService {
  private runtime?: RuntimeLike;

  constructor(
    private readonly config: EnvConfig,
    private readonly gatewayConfig: GatewayConfig,
    private readonly agentSdk?: AgentSdkService,
  ) {}

  attachRuntime(runtime: RuntimeLike): void {
    this.runtime = runtime;
  }

  currentGatewayConfig(): GatewayConfig {
    return this.gatewayConfig;
  }

  async run(input: {
    skillsCount: number;
    contextFilesCount: number;
    recentCronRuns: number;
    recentTerminalCommands: number;
    repositoryAvailable: boolean;
    gatewayTransportOverview?: {
      mismatchCount: number;
      operationalCount: number;
      details: Array<{
        platform: string;
        mismatchFlags: string[];
        inventory?: {
          detail: string;
        };
        platformState?: {
          detail?: string;
        };
      }>;
    };
  }): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];

    checks.push({
      id: "workspace.exists",
      status: existsSync(this.config.workspaceDir) ? "pass" : "fail",
      summary: "Workspace directory",
      detail: this.config.workspaceDir,
    });

    checks.push({
      id: "workspace.writeable",
      status: (await this.isWritable(this.config.workspaceDir))
        ? "pass"
        : "fail",
      summary: "Workspace write access",
      detail: this.config.workspaceDir,
    });

    checks.push({
      id: "data.exists",
      status: existsSync(this.config.dataDir) ? "pass" : "fail",
      summary: "Agent data directory",
      detail: this.config.dataDir,
    });

    const nativeWorkspacePath = join(
      this.config.workspaceDir,
      "packages",
      "plugins",
    );
    const nativeAudit = getNativePackageAudit(this.config);
    const nativePlugins = getNativePluginCatalog(this.config);
    const ecosystem = this.agentSdk
      ? await this.agentSdk.overview()
      : undefined;
    const compatibility = this.agentSdk
      ? await this.agentSdk.compatibility()
      : undefined;
    const registrySnapshot = ecosystem?.registry;
    const skillCatalog = ecosystem?.skillCatalog;
    const ownership = this.runtime
      ? getNativeOwnershipControlPlane(
          this.runtime,
          undefined,
          this.config,
          this.gatewayConfig,
        )
      : undefined;
    const integrationControl = this.runtime
      ? await getNativeIntegrationControlPlane(this.runtime, {
          web: {
            status: async () => ({
              provider: this.config.browserProvider,
              ready: Boolean(this.config.browserCommand),
              mode:
                this.config.browserProvider === "lightpanda"
                  ? "browser"
                  : "fallback",
              detail:
                this.config.browserProvider === "lightpanda"
                  ? `Lightpanda is configured as the default browser backend via ${this.config.browserCommand}.`
                  : "Basic HTTP fetch mode is configured as the browser fallback.",
              artifacts: {
                snapshot: Boolean(this.config.browserCommand),
                screenshot: Boolean(this.config.browserCommand),
                comparison: Boolean(this.config.browserCommand),
              },
            }),
          },
          mcp: {
            status: () => ({
              enabled: Boolean(this.config.mcpServerCommand),
              detail: this.config.mcpServerCommand
                ? `MCP bridge command configured: ${this.config.mcpServerCommand}`
                : "MCP_SERVER_COMMAND is not configured.",
              command: this.config.mcpServerCommand || undefined,
              timeoutMs: this.config.mcpTimeoutMs,
              discoveredTools: 0,
              cachedToolNames: [],
            }),
            getCachedTools: () => [],
          },
        } as unknown as Parameters<typeof getNativeIntegrationControlPlane>[1])
      : undefined;
    checks.push({
      id: "native.workspace",
      status: existsSync(nativeWorkspacePath) ? "pass" : "warn",
      summary: "Native Eliza workspace packages",
      detail: nativeWorkspacePath,
    });

    checks.push({
      id: "cron.output",
      status: existsSync(this.config.cronOutputDir) ? "pass" : "warn",
      summary: "Automation artifact directory",
      detail: this.config.cronOutputDir,
    });

    checks.push({
      id: "gateway.data",
      status: existsSync(this.config.gatewayDataDir) ? "pass" : "warn",
      summary: "Gateway state directory",
      detail: this.config.gatewayDataDir,
    });

    checks.push({
      id: "provider.configured",
      status:
        this.config.openAiApiKey || this.config.anthropicApiKey
          ? "pass"
          : "warn",
      summary: "Model provider credentials",
      detail:
        this.config.openAiApiKey || this.config.anthropicApiKey
          ? "At least one provider key is present."
          : "No OpenAI or Anthropic API key is configured. Runtime will stay in offline fallback mode.",
    });

    checks.push({
      id: "native.runtime-line",
      status:
        nativeAudit.runtime.alpha === getLatestRuntimeLine().alpha
          ? "pass"
          : "warn",
      summary: "Alpha Eliza runtime line",
      detail: `alpha=${nativeAudit.runtime.alpha} latest=${nativeAudit.runtime.latest}`,
    });

    checks.push({
      id: "native.package-alignment",
      status:
        nativeAudit.summary.alphaOnly > 0 ||
        nativeAudit.summary.workspaceOnly > 0 ||
        nativeAudit.summary.vendored > 0
          ? "warn"
          : "pass",
      summary: "Native package compatibility audit",
      detail: `aligned=${nativeAudit.summary.aligned} vendored=${nativeAudit.summary.vendored} alphaOnly=${nativeAudit.summary.alphaOnly} workspaceOnly=${nativeAudit.summary.workspaceOnly}`,
    });

    checks.push({
      id: "ecosystem.registry",
      status: registrySnapshot?.available ? "pass" : "warn",
      summary: "ElizaOS registry snapshot",
      detail: registrySnapshot?.available
        ? `Registry snapshot available with ${registrySnapshot.total} entries and ${registrySnapshot.nonAppPlugins} non-app plugins.`
        : `Registry snapshot unavailable: ${registrySnapshot?.error ?? "unknown error"}`,
    });

    checks.push({
      id: "ecosystem.skills.catalog",
      status: skillCatalog?.available ? "pass" : "warn",
      summary: "ElizaOS skill catalog",
      detail: skillCatalog?.available
        ? `Skill catalog available with ${skillCatalog.total} cached skills.`
        : `Skill catalog unavailable: ${skillCatalog?.error ?? "unknown error"}`,
    });

    checks.push({
      id: "ecosystem.compatibility",
      status: compatibility
        ? compatibility.compatible
          ? "pass"
          : "warn"
        : "warn",
      summary: "ElizaOS plugin compatibility",
      detail: compatibility
        ? compatibility.compatible
          ? `All ${compatibility.checked} checked plugins are compatible with core ${compatibility.coreVersion}.`
          : `${compatibility.failures}/${compatibility.checked} plugins need attention for core ${compatibility.coreVersion}: ${compatibility.failing.map((entry) => entry.plugin).join(", ")}`
        : "Compatibility report unavailable.",
    });

    checks.push({
      id: "native.transport-mediation",
      status: nativePlugins.some((entry) => entry.category === "messaging")
        ? "pass"
        : "warn",
      summary: "Native messaging plugin mediation",
      detail: nativePlugins
        .filter((entry) => entry.category === "messaging")
        .map(
          (entry) =>
            `${entry.id}:${entry.enabled ? "enabled" : "disabled"}:${entry.source}`,
        )
        .join(", "),
    });

    if (ownership) {
      const controlPlane = ownership.transportControl;
      const pluginManager = ownership.pluginManager;
      const messagingBridge = controlPlane.messagingBridge;
      checks.push({
        id: "native.messaging.services",
        status: messagingBridge.some((entry) => entry.live) ? "pass" : "warn",
        summary: "Native messaging runtime services",
        detail: messagingBridge
          .map(
            (entry) =>
              `${entry.platform}:available=${entry.serviceAvailable}:live=${entry.live}:plugin=${entry.pluginId ?? "n/a"}`,
          )
          .join(", "),
      });
      checks.push({
        id: "native.messaging.control-plane",
        status: controlPlane.totals.operationalTransports > 0 ? "pass" : "warn",
        summary: "Native messaging control plane",
        detail: `configured=${controlPlane.totals.configured} gatewayEnabled=${controlPlane.totals.gatewayEnabled} enabled=${controlPlane.totals.enabledPlugins} available=${controlPlane.totals.availableServices} live=${controlPlane.totals.liveServices} operational=${controlPlane.totals.operationalTransports} official=${controlPlane.totals.officialPlugins} vendored=${controlPlane.totals.vendoredPlugins} custom=${controlPlane.totals.customTransports} product=${controlPlane.totals.productTransports}`,
      });
      checks.push({
        id: "native.plugin-manager",
        status: pluginManager?.summary.total ? "pass" : "warn",
        summary: "Native plugin manager summary",
        detail: pluginManager
          ? `total=${pluginManager.summary.total} enabled=${pluginManager.summary.enabled} official=${pluginManager.summary.official} vendored=${pluginManager.summary.vendored} categories=${pluginManager.summary.categories}`
          : "Plugin manager inventory unavailable.",
      });
      checks.push({
        id: "gateway.transport.inventory",
        status:
          controlPlane.transportInventory.filter((entry) => entry.operational)
            .length > 0
            ? "pass"
            : "warn",
        summary: "Gateway transport inventory",
        detail: summarizeTransportInventory(controlPlane.transportInventory),
      });
      checks.push({
        id: "native.ownership.snapshot",
        status: ownership.serviceResolution.length > 0 ? "pass" : "warn",
        summary: "Native ownership control plane",
        detail: `serviceResolution=${ownership.serviceResolution.length} transportOperational=${controlPlane.totals.operationalTransports} pluginManagerEnabled=${pluginManager?.summary.enabled ?? 0}`,
      });
      if (input.gatewayTransportOverview) {
        checks.push({
          id: "gateway.transport.overview",
          status:
            input.gatewayTransportOverview.mismatchCount > 0 ? "warn" : "pass",
          summary: "Gateway transport overview",
          detail: `operational=${input.gatewayTransportOverview.operationalCount} mismatches=${input.gatewayTransportOverview.mismatchCount}; ${input.gatewayTransportOverview.details
            .map(
              (entry) =>
                `${entry.platform}:${entry.mismatchFlags.length ? entry.mismatchFlags.join("|") : "ok"}`,
            )
            .join(", ")}`,
        });
      }
    }

    checks.push({
      id: "skills.present",
      status: input.skillsCount > 0 ? "pass" : "warn",
      summary: "Installed skills",
      detail: `${input.skillsCount} skill documents found in ${this.config.skillsDir}`,
    });

    checks.push({
      id: "context.present",
      status: input.contextFilesCount > 0 ? "pass" : "warn",
      summary: "Workspace context files",
      detail:
        input.contextFilesCount > 0
          ? `${input.contextFilesCount} context files detected`
          : "No AGENTS.md, SOUL.md, MISSION.md, or ROADMAP.md file found.",
    });

    const enabledPlatforms = Object.entries(this.gatewayConfig.platforms)
      .filter(([, platform]) => platform.enabled)
      .map(([platform]) => platform);
    checks.push({
      id: "gateway.platforms",
      status: enabledPlatforms.length > 0 ? "pass" : "warn",
      summary: "Enabled gateway platforms",
      detail: enabledPlatforms.length
        ? enabledPlatforms.join(", ")
        : "No gateway platforms enabled.",
    });

    checks.push({
      id: "telegram.readiness",
      status:
        this.gatewayConfig.platforms.telegram.enabled &&
        !this.config.telegramBotToken
          ? "fail"
          : this.config.telegramBotToken
            ? "pass"
            : "warn",
      summary: "Telegram transport readiness",
      detail: this.config.telegramBotToken
        ? "Telegram token configured."
        : "TELEGRAM_BOT_TOKEN is not configured.",
    });

    checks.push({
      id: "discord.readiness",
      status:
        this.gatewayConfig.platforms.discord.enabled &&
        !this.config.discordBotToken
          ? "fail"
          : this.config.discordBotToken
            ? "pass"
            : "warn",
      summary: "Discord transport readiness",
      detail: this.config.discordBotToken
        ? "Discord bot token configured."
        : "DISCORD_BOT_TOKEN is not configured.",
    });

    checks.push({
      id: "slack.readiness",
      status:
        this.gatewayConfig.platforms.slack.enabled &&
        (!this.config.slackWebhookUrl || !this.config.slackSigningSecret)
          ? "fail"
          : this.config.slackWebhookUrl && this.config.slackSigningSecret
            ? "pass"
            : "warn",
      summary: "Slack transport readiness",
      detail:
        this.config.slackWebhookUrl && this.config.slackSigningSecret
          ? "Slack webhook and signing secret configured."
          : "SLACK_WEBHOOK_URL and SLACK_SIGNING_SECRET should both be configured.",
    });

    checks.push({
      id: "whatsapp.readiness",
      status:
        this.gatewayConfig.platforms.whatsapp.enabled &&
        !(
          this.config.whatsappAccessToken &&
          this.config.whatsappPhoneNumberId &&
          this.config.whatsappVerifyToken
        )
          ? "fail"
          : this.config.whatsappAccessToken &&
              this.config.whatsappPhoneNumberId &&
              this.config.whatsappVerifyToken
            ? "pass"
            : "warn",
      summary: "WhatsApp transport readiness",
      detail:
        this.config.whatsappAccessToken &&
        this.config.whatsappPhoneNumberId &&
        this.config.whatsappVerifyToken
          ? "WhatsApp credentials and verify token configured."
          : "WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_VERIFY_TOKEN should all be configured.",
    });

    checks.push({
      id: "signal.readiness",
      status:
        this.gatewayConfig.platforms.signal.enabled &&
        !this.config.signalCliCommand
          ? "fail"
          : this.config.signalCliCommand
            ? "pass"
            : "warn",
      summary: "Signal transport readiness",
      detail: this.config.signalCliCommand
        ? "Signal CLI command configured."
        : "SIGNAL_CLI_COMMAND is not configured.",
    });

    checks.push({
      id: "matrix.readiness",
      status:
        this.gatewayConfig.platforms.matrix.enabled &&
        !(this.config.matrixHomeserver && this.config.matrixAccessToken)
          ? "fail"
          : this.config.matrixHomeserver && this.config.matrixAccessToken
            ? "pass"
            : "warn",
      summary: "Matrix transport readiness",
      detail:
        this.config.matrixHomeserver && this.config.matrixAccessToken
          ? "Matrix homeserver and access token configured."
          : "MATRIX_HOMESERVER and MATRIX_ACCESS_TOKEN should both be configured.",
    });

    checks.push({
      id: "email.readiness",
      status:
        this.gatewayConfig.platforms.email.enabled &&
        !this.config.emailSendCommand
          ? "fail"
          : this.config.emailSendCommand
            ? "pass"
            : "warn",
      summary: "Email transport readiness",
      detail: this.config.emailSendCommand
        ? "Email send command configured."
        : "EMAIL_SEND_COMMAND is not configured.",
    });

    checks.push({
      id: "sms.readiness",
      status:
        this.gatewayConfig.platforms.sms.enabled && !this.config.smsSendCommand
          ? "fail"
          : this.config.smsSendCommand
            ? "pass"
            : "warn",
      summary: "SMS transport readiness",
      detail: this.config.smsSendCommand
        ? "SMS send command configured."
        : "SMS_SEND_COMMAND is not configured.",
    });

    checks.push({
      id: "mattermost.readiness",
      status:
        this.gatewayConfig.platforms.mattermost.enabled &&
        !(this.config.mattermostUrl && this.config.mattermostToken)
          ? "fail"
          : this.config.mattermostUrl && this.config.mattermostToken
            ? "pass"
            : "warn",
      summary: "Mattermost transport readiness",
      detail:
        this.config.mattermostUrl && this.config.mattermostToken
          ? "Mattermost server URL and token configured."
          : "MATTERMOST_URL and MATTERMOST_TOKEN should both be configured.",
    });

    checks.push({
      id: "homeassistant.readiness",
      status:
        this.gatewayConfig.platforms.homeassistant.enabled &&
        !(this.config.homeAssistantUrl && this.config.homeAssistantToken)
          ? "fail"
          : this.config.homeAssistantUrl && this.config.homeAssistantToken
            ? "pass"
            : "warn",
      summary: "Home Assistant transport readiness",
      detail:
        this.config.homeAssistantUrl && this.config.homeAssistantToken
          ? "Home Assistant API URL and token configured."
          : "HOMEASSISTANT_URL and HOMEASSISTANT_TOKEN should both be configured.",
    });

    checks.push({
      id: "dingtalk.readiness",
      status:
        this.gatewayConfig.platforms.dingtalk.enabled &&
        !(this.config.dingtalkWebhookUrl || this.config.dingtalkAccessToken)
          ? "fail"
          : this.config.dingtalkWebhookUrl || this.config.dingtalkAccessToken
            ? "pass"
            : "warn",
      summary: "DingTalk transport readiness",
      detail:
        this.config.dingtalkWebhookUrl || this.config.dingtalkAccessToken
          ? "DingTalk webhook URL or access token configured."
          : "DINGTALK_WEBHOOK_URL or DINGTALK_ACCESS_TOKEN should be configured.",
    });

    checks.push({
      id: "repository.available",
      status: input.repositoryAvailable ? "pass" : "warn",
      summary: "Repository inspection",
      detail: input.repositoryAvailable
        ? "Git repository detected."
        : "Workspace is not inside a git repository.",
    });

    checks.push({
      id: "cron.activity",
      status: input.recentCronRuns > 0 ? "pass" : "warn",
      summary: "Automation run history",
      detail:
        input.recentCronRuns > 0
          ? `${input.recentCronRuns} recent automation runs recorded.`
          : "No recent cron runs recorded yet.",
    });

    checks.push({
      id: "terminal.activity",
      status: input.recentTerminalCommands > 0 ? "pass" : "warn",
      summary: "Terminal execution history",
      detail:
        input.recentTerminalCommands > 0
          ? `${input.recentTerminalCommands} recent terminal commands recorded.`
          : "No terminal commands recorded yet.",
    });

    checks.push({
      id: "execution.backends",
      status: "pass",
      summary: "Execution backend model",
      detail: `Execution layer supports ${this.config.executionBackend} as the active backend with timeout=${this.config.executionCommandTimeoutMs}ms and health timeout=${this.config.executionHealthTimeoutMs}ms.`,
    });

    checks.push({
      id: "daytona.readiness",
      status:
        this.config.executionBackend === "daytona" && !this.config.daytonaTarget
          ? "fail"
          : this.config.daytonaTarget
            ? "pass"
            : "warn",
      summary: "Daytona execution readiness",
      detail: this.config.daytonaTarget
        ? `Daytona sandbox target configured: ${this.config.daytonaTarget}. Shell=${this.config.daytonaCommand || "daytona"} ${this.config.daytonaShell || "/bin/sh"} workspace=${this.config.daytonaWorkspacePath || "/workspace"}${this.config.daytonaSnapshot ? ` snapshot=${this.config.daytonaSnapshot}` : ""}.`
        : "ELIZA_AGENT_DAYTONA_TARGET is not configured.",
    });

    checks.push({
      id: "daytona.shell",
      status: this.config.daytonaShell ? "pass" : "warn",
      summary: "Daytona shell strategy",
      detail: this.config.daytonaShell
        ? `Daytona commands execute through ${this.config.daytonaShell} with an info probe and exec path.`
        : "Daytona shell strategy is not configured.",
    });

    checks.push({
      id: "daytona.snapshot",
      status: this.config.daytonaSnapshot ? "pass" : "warn",
      summary: "Daytona snapshot reference",
      detail: this.config.daytonaSnapshot
        ? `Daytona snapshot configured: ${this.config.daytonaSnapshot}.`
        : "No Daytona snapshot reference configured; the backend will use the live sandbox target.",
    });

    checks.push({
      id: "daytona.inspect",
      status: this.config.daytonaInspectCommand ? "pass" : "warn",
      summary: "Daytona inspect command",
      detail: this.config.daytonaInspectCommand
        ? `Daytona inspect command configured: ${this.config.daytonaInspectCommand}.`
        : "Daytona inspect command will be synthesized from the configured target.",
    });

    checks.push({
      id: "modal.readiness",
      status:
        this.config.executionBackend === "modal" && !this.config.modalTarget
          ? "fail"
          : this.config.modalTarget
            ? "pass"
            : "warn",
      summary: "Modal execution readiness",
      detail: this.config.modalTarget
        ? `Modal shell target configured: ${this.config.modalTarget}. Shell=${this.config.modalCommand || "modal"} ${this.config.modalShell || "/bin/bash"} workspace=${this.config.modalWorkspacePath || "/workspace"}${this.config.modalEnvironment ? ` env=${this.config.modalEnvironment}` : ""}.`
        : "ELIZA_AGENT_MODAL_TARGET is not configured.",
    });

    checks.push({
      id: "modal.shell",
      status: this.config.modalShell ? "pass" : "warn",
      summary: "Modal shell strategy",
      detail: this.config.modalShell
        ? `Modal shell runs commands through ${this.config.modalShell} and can be bound to ${this.config.modalEnvironment || "the active profile"}.`
        : "Modal shell strategy is not configured.",
    });

    checks.push({
      id: "modal.environment",
      status: this.config.modalEnvironment ? "pass" : "warn",
      summary: "Modal environment selection",
      detail: this.config.modalEnvironment
        ? `Modal environment configured: ${this.config.modalEnvironment}.`
        : "No explicit Modal environment configured; the active profile will be used.",
    });

    checks.push({
      id: "modal.inspect",
      status: this.config.modalInspectCommand ? "pass" : "warn",
      summary: "Modal inspect command",
      detail: this.config.modalInspectCommand
        ? `Modal inspect command configured: ${this.config.modalInspectCommand}.`
        : "Modal inspect command will be synthesized from the configured target.",
    });

    checks.push({
      id: "browser.backend",
      status:
        this.config.browserProvider === "lightpanda" &&
        !this.config.browserCommand
          ? "fail"
          : "pass",
      summary: "Browser backend configuration",
      detail:
        this.config.browserProvider === "lightpanda"
          ? `Lightpanda is configured as the default browser backend via ${this.config.browserCommand}.`
          : "Basic HTTP fetch mode is configured as the browser fallback.",
    });

    if (integrationControl) {
      checks.push({
        id: "integration.browser.native",
        status:
          integrationControl.browser.source === "native" ? "pass" : "warn",
        summary: "Native browser integration",
        detail:
          integrationControl.browser.source === "native"
            ? "Browser status is resolved through the native Eliza service bridge."
            : "Browser status is still resolved through the product fallback service.",
      });
      checks.push({
        id: "integration.mcp.native",
        status: integrationControl.mcp.source === "native" ? "pass" : "warn",
        summary: "Native MCP integration",
        detail:
          integrationControl.mcp.source === "native"
            ? `MCP status is resolved through the native Eliza service bridge with ${integrationControl.mcp.cachedTools.length} cached tool(s).`
            : "MCP status is still resolved through the product fallback service.",
      });
    }

    checks.push({
      id: "execution.remote.sync",
      status: this.config.remoteSyncInclude.length > 0 ? "pass" : "warn",
      summary: "Remote workspace sync planning",
      detail: `Mode=${this.config.remoteSyncMode}; include=${this.config.remoteSyncInclude.join(", ") || "none"}; exclude=${this.config.remoteSyncExclude.join(", ") || "none"}; workspace label=${this.config.remoteWorkspaceLabel}.`,
    });

    checks.push({
      id: "execution.remote.artifacts",
      status: this.config.remoteArtifactPaths.length > 0 ? "pass" : "warn",
      summary: "Remote artifact policy",
      detail: `Policy=${this.config.remoteArtifactPolicy}; artifact paths=${this.config.remoteArtifactPaths.join(", ") || "none"}; snapshots persist metadata only.`,
    });

    checks.push({
      id: "mcp.bridge",
      status: this.config.mcpServerCommand ? "pass" : "warn",
      summary: "MCP bridge configuration",
      detail: this.config.mcpServerCommand
        ? `MCP bridge command configured: ${this.config.mcpServerCommand}`
        : "MCP_SERVER_COMMAND is not configured.",
    });

    checks.push({
      id: "acp.bridge",
      status: this.config.acpServerCommand ? "pass" : "warn",
      summary: "ACP bridge configuration",
      detail: this.config.acpServerCommand
        ? `ACP bridge command configured: ${this.config.acpServerCommand}`
        : "ACP_SERVER_COMMAND is not configured.",
    });

    return checks;
  }

  async setupChecklist(): Promise<string[]> {
    const steps = [
      "Copy .env.example to .env and fill in at least one provider key.",
      "Choose a primary provider: OpenAI or Anthropic.",
      "Run bun install so the vendored native Eliza workspace packages resolve before booting the runtime.",
      "Add workspace context files like AGENTS.md or MISSION.md if you want persistent operator guidance.",
      "Enable gateway platforms in gateway.json only after their credentials are configured.",
      "Run /doctor after configuration changes.",
    ];

    if (!this.config.telegramBotToken) {
      steps.push(
        "Set TELEGRAM_BOT_TOKEN before enabling the Telegram gateway path.",
      );
    }
    if (!this.config.discordBotToken) {
      steps.push(
        "Set DISCORD_BOT_TOKEN before enabling the Discord gateway path.",
      );
    }
    if (!this.config.slackWebhookUrl || !this.config.slackSigningSecret) {
      steps.push(
        "Set SLACK_WEBHOOK_URL and SLACK_SIGNING_SECRET before enabling the Slack gateway path.",
      );
    }
    if (
      !this.config.whatsappAccessToken ||
      !this.config.whatsappPhoneNumberId ||
      !this.config.whatsappVerifyToken
    ) {
      steps.push(
        "Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_VERIFY_TOKEN before enabling the WhatsApp gateway path.",
      );
    }
    if (!this.config.signalCliCommand) {
      steps.push(
        "Set SIGNAL_CLI_COMMAND before enabling the Signal gateway path.",
      );
    }
    if (!this.config.matrixHomeserver || !this.config.matrixAccessToken) {
      steps.push(
        "Set MATRIX_HOMESERVER and MATRIX_ACCESS_TOKEN before enabling the Matrix gateway path.",
      );
    }
    if (!this.config.emailSendCommand) {
      steps.push(
        "Set EMAIL_SEND_COMMAND before enabling the Email gateway path.",
      );
    }
    if (!this.config.smsSendCommand) {
      steps.push("Set SMS_SEND_COMMAND before enabling the SMS gateway path.");
    }
    if (this.config.browserProvider === "lightpanda") {
      steps.push(
        "Install Lightpanda or set ELIZA_AGENT_BROWSER_PROVIDER=basic if you want browser tasks to fall back to plain HTTP fetch mode.",
      );
    }
    steps.push(
      "Review ELIZA_AGENT_REMOTE_SYNC_MODE, ELIZA_AGENT_REMOTE_SYNC_INCLUDE, ELIZA_AGENT_REMOTE_SYNC_EXCLUDE, ELIZA_AGENT_REMOTE_ARTIFACT_PATHS, and ELIZA_AGENT_REMOTE_ARTIFACT_POLICY so Daytona and Modal snapshots stay metadata-only and operator-visible.",
    );
    if (!this.config.remoteSyncInclude.length) {
      steps.push(
        "Set ELIZA_AGENT_REMOTE_SYNC_INCLUDE and ELIZA_AGENT_REMOTE_SYNC_EXCLUDE to describe which paths should be mirrored or snapshotted for remote workspaces.",
      );
    }
    if (!this.config.remoteArtifactPaths.length) {
      steps.push(
        "Set ELIZA_AGENT_REMOTE_ARTIFACT_PATHS if you want operator-visible artifact metadata recorded for Daytona and Modal runs.",
      );
    }
    if (!this.config.remoteWorkspaceLabel) {
      steps.push(
        "Set ELIZA_AGENT_REMOTE_WORKSPACE_LABEL so remote lifecycle snapshots have a stable operator-facing label.",
      );
    }
    if (!this.config.mcpServerCommand) {
      steps.push(
        "Set MCP_SERVER_COMMAND if you want MCP-backed tool discovery and invocation.",
      );
    }
    if (!this.config.acpServerCommand) {
      steps.push(
        "Set ACP_SERVER_COMMAND if you want ACP-backed editor and protocol integrations.",
      );
    }
    if (this.config.executionBackend !== "local") {
      steps.push(
        `Validate ${this.config.executionBackend} runtime access and run /execution status before relying on remote or containerized execution.`,
      );
    }
    if (
      this.config.executionBackend === "singularity" &&
      !this.config.singularityImage
    ) {
      steps.push(
        "Set ELIZA_AGENT_SINGULARITY_IMAGE before relying on the Singularity execution backend.",
      );
    }
    if (
      this.config.executionBackend === "daytona" &&
      !this.config.daytonaTarget
    ) {
      steps.push(
        "Set ELIZA_AGENT_DAYTONA_TARGET before relying on the Daytona execution backend.",
      );
    }
    if (
      this.config.executionBackend === "daytona" &&
      !this.config.daytonaWorkspacePath
    ) {
      steps.push(
        "Set ELIZA_AGENT_DAYTONA_WORKSPACE_PATH before relying on the Daytona execution backend.",
      );
    }
    if (!this.config.daytonaShell) {
      steps.push(
        "Set ELIZA_AGENT_DAYTONA_SHELL to choose the shell used inside Daytona sandboxes.",
      );
    }
    if (
      this.config.executionBackend === "daytona" &&
      !this.config.daytonaSnapshot
    ) {
      steps.push(
        "Optionally set ELIZA_AGENT_DAYTONA_SNAPSHOT if you want Daytona execution to anchor to a named sandbox snapshot.",
      );
    }
    if (!this.config.daytonaInspectCommand) {
      steps.push(
        "Optionally set ELIZA_AGENT_DAYTONA_INSPECT_COMMAND if you want to override the synthesized Daytona sandbox inspect command.",
      );
    }
    if (this.config.executionBackend === "modal" && !this.config.modalTarget) {
      steps.push(
        "Set ELIZA_AGENT_MODAL_TARGET before relying on the Modal execution backend.",
      );
    }
    if (
      this.config.executionBackend === "modal" &&
      !this.config.modalWorkspacePath
    ) {
      steps.push(
        "Set ELIZA_AGENT_MODAL_WORKSPACE_PATH before relying on the Modal execution backend.",
      );
    }
    if (!this.config.modalShell) {
      steps.push(
        "Set ELIZA_AGENT_MODAL_SHELL to choose the shell used inside Modal sandboxes.",
      );
    }
    if (!this.config.modalEnvironment) {
      steps.push(
        "Optionally set ELIZA_AGENT_MODAL_ENVIRONMENT so Modal shells bind to an explicit environment instead of the active profile.",
      );
    }
    if (!this.config.modalInspectCommand) {
      steps.push(
        "Optionally set ELIZA_AGENT_MODAL_INSPECT_COMMAND if you want to override the synthesized Modal shell inspect command.",
      );
    }

    return steps;
  }

  private async isWritable(path: string): Promise<boolean> {
    try {
      await access(path, fsConstants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}
