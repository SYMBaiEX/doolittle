import { describe, expect, it } from "bun:test";
import type { RuntimeLike } from "../runtime-contracts";
import {
  buildEffectiveTransportInventoryEntry,
  getEffectiveMessagingTransportInventoryEntries,
  isCustomTransportConfigured,
  isTransportGatewayEnabled,
} from "./decision-helpers";

const defaultGatewayConfig = {
  api: { enabled: true },
  cli: { enabled: true },
  telegram: { enabled: true },
  discord: { enabled: true },
  slack: { enabled: true },
  whatsapp: { enabled: true },
  signal: { enabled: true },
  matrix: { enabled: true },
  email: { enabled: true },
  sms: { enabled: true },
  mattermost: { enabled: true },
  homeassistant: { enabled: true },
  dingtalk: { enabled: true },
};

describe("transport decision helpers", () => {
  it("checks gateway and custom transport configuration states", () => {
    expect(isTransportGatewayEnabled(undefined, "telegram")).toBe(false);
    expect(
      isTransportGatewayEnabled(
        { platforms: defaultGatewayConfig } as never,
        "slack",
      ),
    ).toBe(true);

    expect(
      isCustomTransportConfigured("slack", {
        slackWebhookUrl: "https://hooks.slack.test",
        slackSigningSecret: "secret",
      } as never),
    ).toBe(true);
    expect(
      isCustomTransportConfigured("slack", {
        slackWebhookUrl: "https://hooks.slack.test",
      } as never),
    ).toBe(false);
  });

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

  it("flags disabled platform transport inventory when gateway is not configured", () => {
    const entry = buildEffectiveTransportInventoryEntry(
      "telegram",
      {
        telegramBotToken: "telegram-token",
      } as never,
      {
        platforms: {
          ...defaultGatewayConfig,
          telegram: { enabled: false },
        },
      } as never,
      {
        platform: "telegram",
        pluginId: "messaging.telegram",
        pluginSource: "official",
        configEnabled: true,
        pluginEnabled: true,
        gatewayEnabled: false,
        serviceName: "telegram",
        serviceAvailable: true,
        live: true,
        reason: "live",
        detail: "telegram live",
      },
    );

    expect(entry.operational).toBe(false);
    expect(entry.reason).toBe("gateway-disabled");
    expect(entry.detail).toContain("disabled in gateway config");
  });

  it("marks missing plugin services as not-configured when disabled", () => {
    const runtime = {
      getService(_name: string) {
        return undefined;
      },
    } as unknown as RuntimeLike;

    const [telegram, discord] = getEffectiveMessagingTransportInventoryEntries(
      runtime,
      {
        telegramBotToken: undefined,
        discordBotToken: undefined,
      } as never,
      { platforms: defaultGatewayConfig } as never,
    );

    expect(telegram.platform).toBe("telegram");
    expect(telegram.reason).toBe("not-configured");
    expect(telegram.configEnabled).toBe(false);
    expect(telegram.serviceAvailable).toBe(false);

    expect(discord.platform).toBe("discord");
    expect(discord.reason).toBe("not-configured");
    expect(discord.pluginEnabled).toBe(false);
  });

  it("flags messaging services as unavailable when bridge runtime service is incomplete", () => {
    const runtime = {
      getService(name: string) {
        if (name === "telegram") {
          return {
            bot: {},
            messageManager: {},
            knownChats: new Map([["chat-1", { id: "chat-1" }]]),
          };
        }
        if (name === "discord_transport") {
          return {
            notHistory: () => "missing-history",
          };
        }
        return undefined;
      },
    } as unknown as RuntimeLike;

    const [telegram, discord] = getEffectiveMessagingTransportInventoryEntries(
      runtime,
      {
        telegramBotToken: "telegram-token",
        discordBotToken: "discord-token",
      } as never,
      { platforms: defaultGatewayConfig } as never,
    );

    expect(telegram.reason).toBe("live");
    expect(telegram.live).toBe(true);
    expect(discord.reason).toBe("service-unavailable");
    expect(discord.live).toBe(false);
    expect(discord.detail).toContain("not fully live");
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
