import { existsSync, constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { DiagnosticCheck, EnvConfig, GatewayConfig } from "@/types";

export class DiagnosticsService {
  constructor(
    private readonly config: EnvConfig,
    private readonly gatewayConfig: GatewayConfig,
  ) {}

  async run(input: {
    skillsCount: number;
    contextFilesCount: number;
    recentCronRuns: number;
    recentTerminalCommands: number;
    repositoryAvailable: boolean;
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
      "elizaos-official",
    );
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
