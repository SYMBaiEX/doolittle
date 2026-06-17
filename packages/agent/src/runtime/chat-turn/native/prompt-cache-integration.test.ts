import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import type { TurnState } from "../state";
import { buildShortcutPromptCache } from "./shortcuts";

function context(provider: string): AgentExecutionContext {
  return {
    services: {
      settings: { get: () => ({ model: { provider, model: "m1" } }) },
      personalities: { getActive: () => ({ id: "p1" }) },
    },
    runtime: { logger: { debug: () => {} } },
  } as unknown as AgentExecutionContext;
}

const turn = { roomId: "room-1" } as unknown as TurnState;

describe("buildShortcutPromptCache (cache funnel at the real seam)", () => {
  it("emits lossless promptSegments for an explicit provider (anthropic)", () => {
    const r = buildShortcutPromptCache({
      context: context("anthropic"),
      turn,
      stableBlocks: ["SYS"],
      volatile: "USER",
    });
    expect(r.prompt).toBe("SYS\nUSER");
    expect(r.promptSegments).toBeDefined();
    // The exact invariant the SDK requires of anything passed to useModel.
    expect(r.promptSegments?.map((s) => s.content).join("")).toBe(r.prompt);
    expect(r.promptSegments?.at(0)?.stable).toBe(true);
    expect(r.promptSegments?.at(-1)?.stable).toBe(false);
  });

  it("emits NO segments for a non-caching provider (devin)", () => {
    const r = buildShortcutPromptCache({
      context: context("devin"),
      turn,
      stableBlocks: ["SYS"],
      volatile: "USER",
    });
    expect(r.prompt).toBe("SYS\nUSER");
    expect(r.promptSegments).toBeUndefined();
    expect(r.providerOptions).toBeUndefined();
  });

  it("scopes OpenAI provider options with a stable cache key + conversation id", () => {
    const r = buildShortcutPromptCache({
      context: context("openai"),
      turn,
      stableBlocks: ["SYS"],
      volatile: "USER",
    });
    const opts = r.providerOptions as
      | {
          openai?: { promptCacheKey?: string };
          eliza?: { conversationId?: string };
        }
      | undefined;
    expect(opts?.openai?.promptCacheKey).toBeTruthy();
    expect(opts?.eliza?.conversationId).toBe("room-1");
  });
});
