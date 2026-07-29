import type { Action, Memory, UUID } from "@elizaos/core";
import {
  matchShortcut,
  runShortcutGate,
  ShortcutRegistry,
} from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import {
  createShortcutCompatibleWebSearchAction,
  DOOLITTLE_SDK_SHORTCUTS,
} from "./sdk-native-surface";

describe("Eliza-native Doolittle surface", () => {
  it("registers explicit web and deep-research shortcuts", () => {
    expect(DOOLITTLE_SDK_SHORTCUTS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aliases: ["/web", "!web"],
          target: { kind: "action", name: "WEB_SEARCH" },
        }),
        expect.objectContaining({
          aliases: ["/research"],
          target: { kind: "action", name: "DOOLITTLE_RESEARCH" },
        }),
      ]),
    );
  });

  it("keeps natural-language action selection inside the Eliza planner", () => {
    const match = matchShortcut(
      DOOLITTLE_SDK_SHORTCUTS,
      "Search the web for the latest Nub.js release",
      {
        actions: ["WEB_SEARCH", "DOOLITTLE_REPOSITORY"],
        allowNatural: true,
      },
    );

    expect(match).toBeNull();
  });

  it("normalizes shortcut slots into standard action parameters", async () => {
    const handler = vi.fn(async () => ({
      success: true,
      text: "verified result",
    }));
    const sourceAction = {
      name: "WEB_SEARCH",
      description: "Search the web",
      validate: vi.fn(async () => true),
      handler,
    } as Action;
    const action = createShortcutCompatibleWebSearchAction(sourceAction);
    const message = {
      content: { text: "Search the web for the latest Nub.js release" },
    } as Memory;

    await action.handler({} as never, message, undefined, {
      query: "search the web for the latest nub js release",
      mode: "simple",
    });

    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      message,
      undefined,
      expect.objectContaining({
        mode: "simple",
        parameters: {
          query: "search the web for the latest nub js release",
        },
      }),
      undefined,
      undefined,
    );
  });

  it("extracts a query from the explicit /web command", async () => {
    const handler = vi.fn(async () => ({
      success: true,
      text: "verified result",
    }));
    const action = createShortcutCompatibleWebSearchAction({
      name: "WEB_SEARCH",
      description: "Search the web",
      validate: vi.fn(async () => true),
      handler,
    } as Action);
    const message = {
      content: { text: "/web ElizaOS plugin shortcuts" },
    } as Memory;

    await action.handler({} as never, message, undefined, { mode: "simple" });

    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      message,
      undefined,
      expect.objectContaining({
        parameters: { query: "ElizaOS plugin shortcuts" },
      }),
      undefined,
      undefined,
    );
  });

  it("executes the web action through the official pre-LLM shortcut gate", async () => {
    const handler = vi.fn(
      async (_runtime, _message, _state, options, callback) => {
        const parameters = (
          options as { parameters?: { query?: string } } | undefined
        )?.parameters;
        const text = `searched:${parameters?.query ?? "missing"}`;
        await callback?.({ text });
        return { success: true, text };
      },
    );
    const action = createShortcutCompatibleWebSearchAction({
      name: "WEB_SEARCH",
      description: "Search the web",
      validate: vi.fn(async () => true),
      handler,
    } as Action);
    const shortcutRegistry = new ShortcutRegistry();
    shortcutRegistry.registerMany(DOOLITTLE_SDK_SHORTCUTS);
    const id = "00000000-0000-4000-8000-000000000001" as UUID;
    const message = {
      id,
      entityId: id,
      roomId: id,
      content: { text: "/web ElizaOS shortcuts" },
    } as Memory;

    const result = await runShortcutGate({
      runtime: {
        actions: [action],
        agentId: id,
        shortcutRegistry,
        logger: { warn: vi.fn(), debug: vi.fn() },
        emitEvent: vi.fn(async () => undefined),
      } as never,
      message,
      state: {} as never,
      responseId: id,
      senderRole: "OWNER",
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(result?.kind).toBe("direct_reply");
    if (result?.kind !== "direct_reply") {
      throw new Error(
        "Expected the SDK shortcut gate to return a direct reply.",
      );
    }
    expect(result.result.responseContent?.text).toBe(
      "searched:ElizaOS shortcuts",
    );
  });

  it("attributes callbacks and supplies an SDK-native final-answer fallback", async () => {
    const callback = vi.fn(async () => []);
    const action = createShortcutCompatibleWebSearchAction({
      name: "WEB_SEARCH",
      description: "Search the web",
      validate: vi.fn(async () => true),
      handler: vi.fn(async (_runtime, _message, _state, _options, onResult) => {
        await onResult?.({
          text: '{"results":[{"title":"ElizaOS overview","url":"https://docs.elizaos.ai/projects/overview","excerpts":["# Overview\\nElizaOS projects are deployable agent applications."]}]}',
        });
        return {
          success: true,
          text: '{"results":[{"title":"ElizaOS overview","url":"https://docs.elizaos.ai/projects/overview","excerpts":["# Overview\\nElizaOS projects are deployable agent applications."]}]}',
        };
      }),
    } as Action);
    const message = {
      content: { text: "What is ElizaOS?" },
    } as Memory;

    const result = await action.handler(
      {} as never,
      message,
      undefined,
      { parameters: { query: "ElizaOS" } },
      callback,
    );

    expect(callback).toHaveBeenCalledWith(expect.anything(), "WEB_SEARCH");
    expect(result?.userFacingText).toContain(
      "[ElizaOS overview](https://docs.elizaos.ai/projects/overview)",
    );
    expect(result?.userFacingText).toContain(
      "ElizaOS projects are deployable agent applications.",
    );
  });
});
