import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import type { EnvConfig, DiagnosticCheck, GatewayConfig } from "@/types";

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
      status: (await this.isWritable(this.config.workspaceDir)) ? "pass" : "fail",
      summary: "Workspace write access",
      detail: this.config.workspaceDir,
    });

    checks.push({
      id: "provider.configured",
      status:
        this.config.openAiApiKey || this.config.anthropicApiKey ? "pass" : "warn",
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
      detail: enabledPlatforms.length ? enabledPlatforms.join(", ") : "No gateway platforms enabled.",
    });

    checks.push({
      id: "telegram.readiness",
      status:
        this.gatewayConfig.platforms.telegram.enabled && !this.config.telegramBotToken
          ? "fail"
          : this.config.telegramBotToken
            ? "pass"
            : "warn",
      summary: "Telegram transport readiness",
      detail:
        this.config.telegramBotToken
          ? "Telegram token configured."
          : "TELEGRAM_BOT_TOKEN is not configured.",
    });

    checks.push({
      id: "discord.readiness",
      status:
        this.gatewayConfig.platforms.discord.enabled && !this.config.discordBotToken
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
      detail: "Execution layer supports local, Docker, and SSH backends with readiness reporting.",
    });

    return checks;
  }

  async setupChecklist(): Promise<string[]> {
    const steps = [
      "Copy .env.example to .env and fill in at least one provider key.",
      "Choose a primary provider: OpenAI or Anthropic.",
      "Add workspace context files like AGENTS.md or MISSION.md if you want persistent operator guidance.",
      "Enable gateway platforms in gateway.json only after their credentials are configured.",
      "Run /doctor after configuration changes.",
    ];

    if (!this.config.telegramBotToken) {
      steps.push("Set TELEGRAM_BOT_TOKEN before enabling the Telegram gateway path.");
    }
    if (!this.config.discordBotToken) {
      steps.push("Set DISCORD_BOT_TOKEN before enabling the Discord gateway path.");
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
