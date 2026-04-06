import { describe, expect, it } from "bun:test";
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

  it("returns the full requirement inventory", () => {
    const records = getTransportRequirementRecords(config, gatewayConfig);

    expect(records).toHaveLength(11);
    expect(records.some((record) => record.platform === "slack")).toBe(true);
  });
});
