import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import {
  finalizeTurnResponse,
  getContextUsageWarning,
  maybeGetSkillSynthesisNudge,
} from "./chat-turn/finalization";
import type { TurnState } from "./chat-turn/state";

describe("chat turn finalization helpers", () => {
  it("writes final assistant messages and completes the turn", async () => {
    const events: string[] = [];
    const context = {
      runtime: {},
      services: {
        runController: {
          finishTurn: (sessionId: string, status: string) => {
            events.push(`${sessionId}:${status}`);
          },
        },
        sessions: {
          storeMessage: () => {
            events.push("stored");
          },
        },
      },
      config: {},
    } as unknown as AgentExecutionContext;
    const turn = {
      sessionId: "session-1",
      roomId: "room-1",
      entityId: "entity-1",
    } as TurnState;

    const progress: unknown[] = [];
    const response = await finalizeTurnResponse(
      context,
      turn,
      "done",
      () => events.push("observed"),
      {
        onResponseProgress: async (update) => {
          progress.push(update.phase);
        },
      },
    );

    expect(response).toBe("done");
    expect(events).toEqual(["stored", "session-1:complete", "observed"]);
    expect(progress).toEqual(["command"]);
  });

  it("returns context warnings when usage is near capacity", () => {
    const context = {
      services: {
        contextCompression: {
          isApproachingLimit: () => true,
          measure: () => ({
            usageFraction: 0.87,
            estimatedTokens: 2500,
          }),
        },
        sessions: {
          recentBySession: () => new Array(10).fill("msg"),
        },
      },
      runtime: {},
      config: {},
    } as unknown as AgentExecutionContext;

    const warning = getContextUsageWarning(context, "session-1");
    expect(warning).toContain("⚠️");
    expect(warning).toContain("capacity");
  });

  it("returns skill synthesis nudges at stable intervals", () => {
    const context = {
      services: {
        sessions: {
          recentBySession: () => new Array(8).fill("msg"),
        },
        skillSynthesis: {
          analyzeConversation: () => ({
            shouldSynthesize: true,
            candidate: { title: "review workflow" },
          }),
        },
      },
      runtime: {},
      config: {},
    } as unknown as AgentExecutionContext;

    expect(
      maybeGetSkillSynthesisNudge(context, "session-1", 11),
    ).toBeUndefined();
    const nudge = maybeGetSkillSynthesisNudge(context, "session-1", 12);
    expect(nudge).toContain("review workflow");
    expect(nudge).toContain("/skills synthesize");
  });
});
