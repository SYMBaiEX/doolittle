import { ShortcutRegistry, type UUID } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import { runProviderShortcutTurn } from "./shortcut";

const id = "00000000-0000-4000-8000-000000000001" as UUID;

describe("provider-independent SDK shortcut turn", () => {
  it("executes a registered shortcut without entering model readiness", async () => {
    const handler = vi.fn(
      async (_runtime, _message, _state, _options, callback) => {
        await callback?.({ text: "Runtime is ready." });
        return { success: true, text: "Runtime is ready." };
      },
    );
    const shortcutRegistry = new ShortcutRegistry();
    shortcutRegistry.register({
      id: "status",
      kind: "explicit",
      aliases: ["/status"],
      target: { kind: "action", name: "DOOLITTLE_COMMAND" },
      requiresAction: "DOOLITTLE_COMMAND",
    });
    const runtime = {
      actions: [
        {
          name: "DOOLITTLE_COMMAND",
          validate: vi.fn(async () => true),
          handler,
        },
      ],
      agentId: id,
      shortcutRegistry,
      logger: { debug: vi.fn(), warn: vi.fn() },
      emitEvent: vi.fn(async () => undefined),
      getActionResults: vi.fn(() => []),
    };
    const context = {
      runtime,
      services: {
        sessions: {
          continuityKey: vi.fn(() => "session-key"),
        },
      },
    } as unknown as AgentExecutionContext;

    await expect(
      runProviderShortcutTurn({
        context,
        turn: {
          entityId: id,
          roomId: id,
          sessionId: "session-1",
          connectionSource: "desktop",
        } as never,
        userId: "owner",
        effectiveMessage: "/status",
        settingsDuring: {
          model: {
            provider: "ollama",
            model: "granite4.1:3b",
            baseUrl: "http://127.0.0.1:11434",
            temperature: 0.2,
            maxTokens: 2048,
          },
        } as never,
      }),
    ).resolves.toMatchObject({
      handledMessage: true,
      response: "Runtime is ready.",
    });
    expect(handler).toHaveBeenCalledOnce();
  });
});
