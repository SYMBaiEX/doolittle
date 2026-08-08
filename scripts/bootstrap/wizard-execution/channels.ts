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
  let discordApplicationId = answers.discordApplicationId ?? "";
  let slackBotToken = answers.slackBotToken ?? "";
  let slackAppToken = answers.slackAppToken ?? "";
  let slackUserToken = answers.slackUserToken ?? "";
  let slackWebhookUrl = answers.slackWebhookUrl;
  let slackSigningSecret = answers.slackSigningSecret;
  let whatsappAccessToken = answers.whatsappAccessToken ?? "";
  let whatsappPhoneNumberId = answers.whatsappPhoneNumberId ?? "";
  let whatsappVerifyToken = answers.whatsappVerifyToken ?? "";
  let whatsappAppSecret = answers.whatsappAppSecret ?? "";
  let signalAccountNumber = answers.signalAccountNumber ?? "";
  let signalHttpUrl = answers.signalHttpUrl ?? "";
  let signalCliPath = answers.signalCliPath ?? "";
  const signalCliCommand = answers.signalCliCommand ?? "";
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
      discordApplicationId = await promptDeps.ask(
        context,
        rl,
        "Paste DISCORD_APPLICATION_ID (optional)",
        discordApplicationId,
      );
    }
    if (transports.includes("slack")) {
      slackBotToken = await promptDeps.askSecret(
        context,
        rl,
        "Paste SLACK_BOT_TOKEN for the official connector (optional)",
        slackBotToken,
      );
      slackAppToken = await promptDeps.askSecret(
        context,
        rl,
        "Paste SLACK_APP_TOKEN for the official connector (optional)",
        slackAppToken,
      );
      slackUserToken = await promptDeps.askSecret(
        context,
        rl,
        "Paste SLACK_USER_TOKEN (optional)",
        slackUserToken,
      );
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
    if (transports.includes("whatsapp")) {
      whatsappAccessToken = await promptDeps.askSecret(
        context,
        rl,
        "Paste WHATSAPP_ACCESS_TOKEN",
        whatsappAccessToken,
      );
      whatsappPhoneNumberId = await promptDeps.ask(
        context,
        rl,
        "Paste WHATSAPP_PHONE_NUMBER_ID",
        whatsappPhoneNumberId,
      );
      whatsappVerifyToken = await promptDeps.askSecret(
        context,
        rl,
        "Paste WHATSAPP_VERIFY_TOKEN",
        whatsappVerifyToken,
      );
      whatsappAppSecret = await promptDeps.askSecret(
        context,
        rl,
        "Paste WHATSAPP_APP_SECRET (recommended)",
        whatsappAppSecret,
      );
    }
    if (transports.includes("signal")) {
      signalAccountNumber = await promptDeps.ask(
        context,
        rl,
        "Paste SIGNAL_ACCOUNT_NUMBER in E.164 format",
        signalAccountNumber,
      );
      signalHttpUrl = await promptDeps.ask(
        context,
        rl,
        "Paste SIGNAL_HTTP_URL (optional)",
        signalHttpUrl,
      );
      signalCliPath = await promptDeps.ask(
        context,
        rl,
        "Paste SIGNAL_CLI_PATH (optional)",
        signalCliPath,
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
    discordApplicationId,
    slackBotToken,
    slackAppToken,
    slackUserToken,
    slackWebhookUrl,
    slackSigningSecret,
    whatsappAccessToken,
    whatsappPhoneNumberId,
    whatsappVerifyToken,
    whatsappAppSecret,
    signalAccountNumber,
    signalHttpUrl,
    signalCliPath,
    signalCliCommand,
    homeAssistantUrl,
    homeAssistantToken,
  };
}
