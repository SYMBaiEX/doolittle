import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isolatedRuntimeEnvironment } from "./isolated-runtime-environment";

describe("offline fixture runtime isolation", () => {
  it("overrides inherited SDK stores without changing the caller environment", () => {
    const inherited = {
      ELIZA_HOME: "/unowned/home",
      ELIZA_CONFIG_PATH: "/unowned/explicit-config.json",
      DOOLITTLE_DATA_DIR: "/unowned/data",
      ELIZA_ACP_STATE_DIR: "/unowned/acp",
      ACP_AUDIT_LOG_PATH: "/unowned/audit",
      OPENAI_API_KEY: "synthetic-test-key",
      SOME_PROVIDER_API_KEY: "synthetic-test-key",
      GITHUB_TOKEN: "synthetic-test-token",
      CUSTOM_BOT_TOKEN: "synthetic-bot-token",
      CUSTOM_APP_SECRET: "synthetic-app-secret",
      ELIZA_ACCOUNT_POOL_KEEPALIVE: "true",
      PATH: "/fixture/bin",
    };
    const before = { ...inherited };
    const runtimeDir = resolve("fixture-one/runtime");
    const environment = isolatedRuntimeEnvironment(runtimeDir, inherited);
    expect(environment).toMatchObject({
      ELIZA_HOME: runtimeDir,
      ELIZA_CONFIG_PATH: resolve(runtimeDir, "eliza.json"),
      DOOLITTLE_DATA_DIR: runtimeDir,
      ELIZA_ACP_STATE_DIR: resolve(runtimeDir, "plugin-acp"),
      ACP_AUDIT_LOG_PATH: resolve(runtimeDir, "plugin-acp/audit.ndjson"),
      OPENAI_API_KEY: "",
      SOME_PROVIDER_API_KEY: "",
      GITHUB_TOKEN: "",
      CUSTOM_BOT_TOKEN: "",
      CUSTOM_APP_SECRET: "",
      DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
      ELIZA_ACCOUNT_POOL_KEEPALIVE: "false",
      PATH: inherited.PATH,
    });
    expect(inherited).toEqual(before);
  });

  it("blanks supported absent credentials and connectors before dotenv can supply them", () => {
    const environment = isolatedRuntimeEnvironment(
      resolve("fixture/runtime"),
      {},
    );
    const syntheticDotenv = {
      TELEGRAM_BOT_TOKEN: "synthetic-telegram-token",
      DISCORD_BOT_TOKEN: "synthetic-discord-token",
      SLACK_BOT_TOKEN: "synthetic-slack-bot-token",
      SLACK_APP_TOKEN: "synthetic-slack-app-token",
      SLACK_USER_TOKEN: "synthetic-slack-user-token",
      SLACK_SIGNING_SECRET: "synthetic-slack-secret",
      WHATSAPP_VERIFY_TOKEN: "synthetic-whatsapp-token",
      WHATSAPP_APP_SECRET: "synthetic-whatsapp-secret",
      MATRIX_ACCESS_TOKEN: "synthetic-matrix-token",
      MATTERMOST_TOKEN: "synthetic-mattermost-token",
      HOMEASSISTANT_TOKEN: "synthetic-homeassistant-token",
      DINGTALK_WEBHOOK_URL: "https://synthetic.invalid/webhook",
      SLACK_WEBHOOK_URL: "https://synthetic.invalid/webhook",
      SIGNAL_CLI_COMMAND: "synthetic-signal-command",
      EMAIL_SEND_COMMAND: "synthetic-email-command",
      SMS_SEND_COMMAND: "synthetic-sms-command",
      ELIZAOS_CLOUD_EMBEDDING_API_KEY: "synthetic-embedding-key",
      E2B_API_KEY: "synthetic-e2b-key",
    };
    // Match dotenv override:false without reading any repository dotenv file.
    for (const [key, value] of Object.entries(syntheticDotenv)) {
      environment[key] ??= value;
      expect(environment[key], key).toBe("");
    }
  });

  it("never shares task or audit paths across independent fixture profiles", () => {
    const first = isolatedRuntimeEnvironment(
      resolve("fixture-one/runtime"),
      {},
    );
    const second = isolatedRuntimeEnvironment(
      resolve("fixture-two/runtime"),
      {},
    );
    expect(first.ELIZA_ACP_STATE_DIR).not.toBe(second.ELIZA_ACP_STATE_DIR);
    expect(first.ACP_AUDIT_LOG_PATH).not.toBe(second.ACP_AUDIT_LOG_PATH);
    expect(first.ELIZA_HOME).not.toBe(second.ELIZA_HOME);
    expect(first.ELIZA_CONFIG_PATH).not.toBe(second.ELIZA_CONFIG_PATH);
  });

  it("rejects an unowned filesystem root or relative runtime directory", () => {
    expect(() => isolatedRuntimeEnvironment(resolve("/"), {})).toThrow();
    expect(() => isolatedRuntimeEnvironment("relative/runtime", {})).toThrow();
    expect(() => isolatedRuntimeEnvironment("", {})).toThrow();
  });
});
