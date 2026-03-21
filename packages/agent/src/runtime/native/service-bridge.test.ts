import { describe, expect, it } from "bun:test";
import type { RuntimeLike } from "./service-bridge";
import {
  getEffectiveMessagingTransportInventory,
  getEffectiveTransportInventory,
  getNativeTransportControlPlane,
} from "./service-bridge";

describe("getEffectiveMessagingTransportInventory", () => {
  it("reports live telegram and discord services when runtime services exist", () => {
    const runtime = {
      getService(name: string) {
        if (name === "telegram") {
          return {
            bot: {},
            messageManager: {},
            knownChats: new Map([["1", {}]]),
          };
        }
        if (name === "discord_transport") {
          return {
            history: () => [],
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const inventory = getEffectiveMessagingTransportInventory(runtime, {
      telegramBotToken: "telegram-token",
      discordBotToken: "discord-token",
    } as never);

    expect(inventory.find((entry) => entry.platform === "telegram")?.live).toBe(
      true,
    );
    expect(inventory.find((entry) => entry.platform === "discord")?.live).toBe(
      true,
    );
  });

  it("reports disabled bridge state when plugins are not configured", () => {
    const runtime = {
      getService(name: string) {
        if (name === "discord_transport") {
          return {
            history: () => [],
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const inventory = getEffectiveMessagingTransportInventory(runtime, {
      telegramBotToken: undefined,
      discordBotToken: undefined,
    } as never);

    expect(inventory.find((entry) => entry.platform === "telegram")?.live).toBe(
      false,
    );
    expect(inventory.find((entry) => entry.platform === "discord")?.live).toBe(
      false,
    );
  });

  it("builds a native transport control-plane summary", () => {
    const runtime = {
      getService(name: string) {
        if (name === "telegram") {
          return {
            bot: {},
            messageManager: {},
            knownChats: new Map([["1", {}]]),
          };
        }
        if (name === "discord_transport") {
          return {
            history: () => [],
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const controlPlane = getNativeTransportControlPlane(
      runtime,
      {
        telegramBotToken: "telegram-token",
        discordBotToken: undefined,
      } as never,
      {
        platforms: {
          api: { enabled: true },
          cli: { enabled: true },
          telegram: { enabled: true },
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

    expect(controlPlane.totals.configured).toBe(2);
    expect(controlPlane.totals.enabledPlugins).toBe(1);
    expect(controlPlane.totals.availableServices).toBe(2);
    expect(controlPlane.totals.liveServices).toBe(1);
    expect(controlPlane.totals.officialPlugins).toBe(1);
    expect(controlPlane.totals.vendoredPlugins).toBe(1);
    expect(controlPlane.totals.operationalTransports).toBeGreaterThan(0);
  });

  it("builds a shared transport inventory for plugin and custom transports", () => {
    const runtime = {
      getService(name: string) {
        if (name === "telegram") {
          return {
            bot: {},
            messageManager: {},
            knownChats: new Map([["1", {}]]),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const inventory = getEffectiveTransportInventory(
      runtime,
      {
        telegramBotToken: "telegram-token",
        slackWebhookUrl: "https://hooks.slack.test",
        slackSigningSecret: "secret",
      } as never,
      {
        platforms: {
          api: { enabled: true },
          cli: { enabled: true },
          telegram: { enabled: true },
          discord: { enabled: false },
          slack: { enabled: true },
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

    expect(
      inventory.find((entry) => entry.platform === "telegram")?.operational,
    ).toBe(true);
    expect(
      inventory.find((entry) => entry.platform === "slack")?.operational,
    ).toBe(true);
    expect(
      inventory.find((entry) => entry.platform === "discord")?.reason,
    ).toBe("gateway-disabled");
  });
});
