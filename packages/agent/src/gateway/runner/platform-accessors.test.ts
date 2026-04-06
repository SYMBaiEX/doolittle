import { describe, expect, it } from "bun:test";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import {
  createGatewayRunnerPlatformAccessors,
  isGatewayNativeMessagingPlatform,
} from "@/gateway/runner/platform-accessors";
import type { PlatformName } from "@/types/gateway";

describe("gateway runner platform accessors", () => {
  const context = {
    config: {
      telegramBotToken: "telegram-token",
      discordBotToken: "discord-token",
    },
    services: {
      gatewayConfig: {
        platforms: {
          api: { enabled: true },
          telegram: { enabled: true },
          discord: { enabled: false },
          slack: { enabled: false },
        },
      },
    },
    runtime: {
      getService(name: string) {
        if (name === "telegram") {
          return {
            bot: {},
            messageManager: {},
            knownChats: new Map([["1", {}]]),
          };
        }
        if (name === "discord_transport") {
          return { history: () => [] };
        }
        return null;
      },
    },
  } as unknown as GatewayRunnerContext;

  it("identifies native messaging platforms", () => {
    expect(isGatewayNativeMessagingPlatform("telegram")).toBe(true);
    expect(isGatewayNativeMessagingPlatform("discord")).toBe(true);
    expect(isGatewayNativeMessagingPlatform("api" as PlatformName)).toBe(false);
  });

  it("exposes configured platforms, enablement, and native messaging state", () => {
    const accessors = createGatewayRunnerPlatformAccessors(context);

    expect(accessors.getConfiguredPlatforms()).toEqual([
      "api",
      "telegram",
      "discord",
      "slack",
    ]);
    expect(accessors.isPlatformEnabled("api")).toBe(true);
    expect(accessors.isPlatformEnabled("discord")).toBe(false);
    expect(accessors.isPlatformEnabled("slack")).toBe(false);

    expect(accessors.getNativeMessagingState("api")).toBeUndefined();
    expect(accessors.getNativeMessagingState("telegram")?.ready).toBe(true);
    expect(accessors.getNativeMessagingState("telegram")?.summary).toContain(
      "telegram:",
    );
    expect(accessors.getNativeMessagingState("discord")?.ready).toBe(false);
    expect(accessors.getNativeMessagingState("discord")?.summary).toContain(
      "discord:",
    );
  });
});
