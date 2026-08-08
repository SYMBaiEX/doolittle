import { describe, expect, it } from "vitest";
import { applyOptionalProviderSettings } from "./optional-providers";

describe("applyOptionalProviderSettings", () => {
  it("maps complete native messaging configuration to official plugin settings", () => {
    const settings = {} as never;
    applyOptionalProviderSettings(settings, {
      discordBotToken: "discord-token",
      discordApplicationId: "discord-app",
      slackBotToken: "slack-bot",
      slackAppToken: "slack-app",
      slackSigningSecret: "slack-signing",
      slackUserToken: "slack-user",
      whatsappAccessToken: "whatsapp-token",
      whatsappPhoneNumberId: "phone",
      whatsappVerifyToken: "verify",
      whatsappAppSecret: "whatsapp-secret",
      signalAccountNumber: "+15555550100",
      signalHttpUrl: "http://signal.test",
      signalCliPath: "/usr/local/bin/signal-cli",
    } as never);

    expect(settings).toMatchObject({
      DISCORD_API_TOKEN: "discord-token",
      DISCORD_APPLICATION_ID: "discord-app",
      SLACK_BOT_TOKEN: "slack-bot",
      SLACK_APP_TOKEN: "slack-app",
      SLACK_SIGNING_SECRET: "slack-signing",
      SLACK_USER_TOKEN: "slack-user",
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify",
      WHATSAPP_AUTH_METHOD: "cloudapi",
      WHATSAPP_APP_SECRET: "whatsapp-secret",
      SIGNAL_ACCOUNT_NUMBER: "+15555550100",
    });
  });
});
