import { describe, expect, it } from "bun:test";
import type { RuntimeLike } from "../runtime-contracts";
import {
  buildEffectiveTransportInventoryEntry,
  getEffectiveMessagingTransportInventoryEntries,
} from "./decision-helpers";

describe("transport decision helpers", () => {
  it("keeps telegram live when the native bridge is present", () => {
    const runtime = {
      getService(name: string) {
        if (name === "telegram") {
          return {
            bot: {},
            messageManager: {},
            knownChats: new Map([["chat-1", {}]]),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const [telegram] = getEffectiveMessagingTransportInventoryEntries(runtime, {
      telegramBotToken: "telegram-token",
    } as never);

    expect(telegram.platform).toBe("telegram");
    expect(telegram.live).toBe(true);
    expect(telegram.reason).toBe("live");
    expect(telegram.detail).toContain("knownChats=1");
  });

  it("marks disabled gateways as non-operational for custom transports", () => {
    const entry = buildEffectiveTransportInventoryEntry(
      "slack",
      {
        slackWebhookUrl: "https://hooks.slack.test",
        slackSigningSecret: "secret",
      } as never,
      {
        platforms: {
          api: { enabled: true },
          cli: { enabled: true },
          telegram: { enabled: false },
          discord: { enabled: false },
          slack: { enabled: false },
          whatsapp: { enabled: false },
          signal: { enabled: false },
          matrix: { enabled: false },
          email: { enabled: false },
          sms: { enabled: false },
          mattermost: { enabled: false },
          homeassistant: { enabled: false },
          dingtalk: { enabled: false },
        },
      } as never,
    );

    expect(entry.configEnabled).toBe(true);
    expect(entry.gatewayEnabled).toBe(false);
    expect(entry.operational).toBe(false);
    expect(entry.reason).toBe("gateway-disabled");
    expect(entry.detail).toContain("disabled in gateway config");
  });
});
