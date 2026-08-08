import { describe, expect, it } from "vitest";
import type { GatewayConfig } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import {
  getTransportRequirementRecord,
  getTransportRequirementRecords,
} from "./requirements";

describe("transport requirements", () => {
  const config = {
    telegramBotToken: "telegram-token",
    slackWebhookUrl: "slack-webhook",
    slackSigningSecret: "slack-secret",
    dingtalkWebhookUrl: "dingtalk-webhook",
  } as EnvConfig;
  const gatewayConfig = {
    platforms: {
      telegram: { enabled: true },
      slack: { enabled: true },
      dingtalk: { enabled: false },
    },
  } as GatewayConfig;

  it("marks fully configured all-required transports as pass", () => {
    const record = getTransportRequirementRecord(
      config,
      gatewayConfig,
      "telegram",
    );

    expect(record?.status).toBe("pass");
    expect(record?.configured).toBe(true);
    expect(record?.missing).toEqual([]);
    expect(record?.summary).toBe("Telegram transport configured.");
    expect(record?.checklist).toBeNull();
  });

  it("tracks any-required transports with partial configuration", () => {
    const record = getTransportRequirementRecord(
      config,
      gatewayConfig,
      "dingtalk",
    );

    expect(record?.mode).toBe("any");
    expect(record?.configured).toBe(true);
    expect(record?.missing).toEqual([]);
    expect(record?.summary).toBe(
      "DingTalk transport configured via DINGTALK_WEBHOOK_URL.",
    );
  });

  it("accepts official Slack and Signal credential routes", () => {
    const nativeConfig = {
      ...config,
      slackWebhookUrl: undefined,
      slackSigningSecret: undefined,
      slackBotToken: "xoxb-token",
      slackAppToken: "xapp-token",
      signalAccountNumber: "+15555550123",
    } as EnvConfig;

    expect(
      getTransportRequirementRecord(nativeConfig, gatewayConfig, "slack")
        ?.configured,
    ).toBe(true);
    expect(
      getTransportRequirementRecord(nativeConfig, gatewayConfig, "signal")
        ?.configured,
    ).toBe(true);
  });

  it("returns the full requirement inventory", () => {
    const records = getTransportRequirementRecords(config, gatewayConfig);

    expect(records).toHaveLength(11);
    expect(records.some((record) => record.platform === "slack")).toBe(true);
  });
});
