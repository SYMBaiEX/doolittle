import { describe, expect, it } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import type { TurnState } from "../state";
import { buildShortcutPromptCache } from "./shortcuts";

function context(provider: string): AgentExecutionContext {
  return {
    services: {
      settings: { get: () => ({ model: { provider, model: "m1" } }) },
      personalities: { getActive: () => ({ id: "p1" }) },
      sessions: {
        projectIdForSession: () => undefined,
        getProject: () => undefined,
        projectResources: () => [],
      },
    },
    runtime: { logger: { debug: () => {} } },
  } as unknown as AgentExecutionContext;
}

const turn = {
  roomId: "room-1",
  sessionId: "session-1",
} as unknown as TurnState;

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

  it("adds project context as a cacheable stable block for project shortcuts", () => {
    const projectContext = context("anthropic");
    (
      projectContext.services.sessions as unknown as {
        projectIdForSession: () => string;
        getProject: () => {
          id: string;
          name: string;
          pinned: boolean;
          createdAt: string;
          updatedAt: string;
        };
        projectResources: () => [];
      }
    ).projectIdForSession = () => "project-1";
    (
      projectContext.services.sessions as unknown as {
        getProject: () => {
          id: string;
          name: string;
          pinned: boolean;
          createdAt: string;
          updatedAt: string;
        };
      }
    ).getProject = () => ({
      id: "project-1",
      name: "Desktop",
      pinned: false,
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    });

    const r = buildShortcutPromptCache({
      context: projectContext,
      turn,
      stableBlocks: ["SYS"],
      volatile: "USER",
    });

    expect(r.prompt).toContain("PROJECT CONTEXT");
    expect(
      r.promptSegments?.some((segment) =>
        segment.content.includes("PROJECT CONTEXT"),
      ),
    ).toBe(true);
    expect(
      r.promptSegments?.find((segment) =>
        segment.content.includes("PROJECT CONTEXT"),
      )?.stable,
    ).toBe(true);
  });
});
