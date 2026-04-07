import { describe, expect, it } from "bun:test";
import { createPlatformAdapter } from "@/gateway/adapters/platform-adapter-factory";
import { MockPlatformAdapter } from "@/gateway/platforms/mock-adapter";
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
});
