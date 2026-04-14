import type { BootstrapWizardContext } from "../bootstrap-context";
import type { PromptHandle } from "../prompting/types";
import type { PairingMode, TransportName, WizardAnswers } from "../types";
import type {
  ExecutionChannelsSelectionResult,
  ExecutionHandsPromptDeps,
} from "./types";

export async function runExecutionChannelSelectionFlow(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  answers: WizardAnswers,
  promptDeps: ExecutionHandsPromptDeps,
): Promise<ExecutionChannelsSelectionResult> {
  let transports: TransportName[] = [];
  let pairingMode: PairingMode = answers.pairingMode;
  let allowAllUsers = answers.allowAllUsers;
  let telegramBotToken = answers.telegramBotToken;
  let discordBotToken = answers.discordBotToken;
  let slackWebhookUrl = answers.slackWebhookUrl;
  let slackSigningSecret = answers.slackSigningSecret;
  let homeAssistantUrl = answers.homeAssistantUrl;
  let homeAssistantToken = answers.homeAssistantToken;

  if (answers.mode === "ritual") {
    context.section(
      "Channels",
      "Open the places where people and systems can reach me.",
    );
    transports = await promptDeps.chooseMany<TransportName>(
      context,
      rl,
      "Open these channels for me:",
      [
        { value: "telegram", label: "Telegram" },
        { value: "discord", label: "Discord" },
        { value: "slack", label: "Slack" },
        { value: "whatsapp", label: "WhatsApp" },
        { value: "signal", label: "Signal" },
        { value: "matrix", label: "Matrix" },
        { value: "email", label: "Email" },
        { value: "sms", label: "SMS" },
        { value: "mattermost", label: "Mattermost" },
        { value: "homeassistant", label: "Home Assistant" },
        { value: "dingtalk", label: "DingTalk" },
      ],
      [],
    );
    pairingMode = await promptDeps.chooseOne<PairingMode>(
      context,
      rl,
      "How should I greet new arrivals:",
      [
        {
          value: "pair",
          label: "Pair",
          detail: "Let new people knock, then decide whether to let them in.",
        },
        {
          value: "allow",
          label: "Allow",
          detail: "Let people in by default.",
        },
        {
          value: "deny",
          label: "Deny",
          detail: "Keep the gates closed until I am told otherwise.",
        },
      ],
      pairingMode,
    );
    allowAllUsers = await promptDeps.askYesNo(
      context,
      rl,
      "Should I trust everyone on remote channels by default",
      allowAllUsers,
    );
    if (transports.includes("telegram")) {
      telegramBotToken = await promptDeps.askSecret(
        context,
        rl,
        "Paste TELEGRAM_BOT_TOKEN",
        telegramBotToken,
      );
    }
    if (transports.includes("discord")) {
      discordBotToken = await promptDeps.askSecret(
        context,
        rl,
        "Paste DISCORD_BOT_TOKEN",
        discordBotToken,
      );
    }
    if (transports.includes("slack")) {
      slackWebhookUrl = await promptDeps.askSecret(
        context,
        rl,
        "Paste SLACK_WEBHOOK_URL",
        slackWebhookUrl,
      );
      slackSigningSecret = await promptDeps.askSecret(
        context,
        rl,
        "Paste SLACK_SIGNING_SECRET",
        slackSigningSecret,
      );
    }
    if (transports.includes("homeassistant")) {
      homeAssistantUrl = await promptDeps.ask(
        context,
        rl,
        "Paste HOMEASSISTANT_URL",
        homeAssistantUrl,
      );
      homeAssistantToken = await promptDeps.askSecret(
        context,
        rl,
        "Paste HOMEASSISTANT_TOKEN",
        homeAssistantToken,
      );
    }
  }

  return {
    transports,
    pairingMode,
    allowAllUsers,
    telegramBotToken,
    discordBotToken,
    slackWebhookUrl,
    slackSigningSecret,
    homeAssistantUrl,
    homeAssistantToken,
  };
}
