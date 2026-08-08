import { describe, expect, it } from "vitest";
import { createPlatformAdapter } from "@/gateway/adapters/platform-adapter-factory";
import { DiscordPlatformAdapter } from "@/gateway/platforms/discord-adapter";
import { MockPlatformAdapter } from "@/gateway/platforms/mock-adapter";
import { NativeMessageConnectorAdapter } from "@/gateway/platforms/native-message-connector-adapter";
import { TelegramPlatformAdapter } from "@/gateway/platforms/telegram-adapter";
import type { GatewayRunnerContext } from "@/gateway/runner/context";

function createContext(): GatewayRunnerContext {
  return {
    config: {
      telegramBotToken: "token",
      discordBotToken: "",
    },
    runtime: {},
    services: {
      delivery: {
        add: () => undefined,
        updateStatus: () => undefined,
      },
      gatewayConfig: {
        platforms: {
          telegram: { enabled: true },
          discord: { enabled: false },
        },
        transports: [],
      },
    },
  } as unknown as GatewayRunnerContext;
}

describe("createPlatformAdapter", () => {
  it("builds native messaging adapters for linked platforms", () => {
    const adapter = createPlatformAdapter("telegram", createContext());

    expect(adapter).toBeInstanceOf(TelegramPlatformAdapter);
  });

  it("falls back to the mock adapter for product transports", () => {
    const adapter = createPlatformAdapter("api", createContext());

    expect(adapter).toBeInstanceOf(MockPlatformAdapter);
  });

  it("uses a registered native connector only with complete native configuration", () => {
    const context = createContext();
    context.config.discordBotToken = "token";
    context.runtime = {
      getMessageConnectors: () => [
        {
          source: "discord",
          label: "Discord",
          capabilities: ["send_message"],
          supportedTargetKinds: [],
          contexts: [],
        },
      ],
    } as never;

    expect(createPlatformAdapter("discord", context)).toBeInstanceOf(
      NativeMessageConnectorAdapter,
    );
  });

  it("retains the raw adapter when native configuration has no registered connector", () => {
    const context = createContext();
    context.config.discordBotToken = "token";
    context.runtime = { getMessageConnectors: () => [] } as never;

    expect(createPlatformAdapter("discord", context)).toBeInstanceOf(
      DiscordPlatformAdapter,
    );
  });
});
