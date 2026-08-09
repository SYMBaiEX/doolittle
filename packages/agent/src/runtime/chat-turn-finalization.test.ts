import { describe, expect, it } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import {
  getContextUsageWarning,
  maybeGetSkillSynthesisNudge,
} from "./chat-turn/finalization";

describe("chat turn finalization helpers", () => {
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
    expect(warning).toContain("`/compress`");
    expect(warning).not.toContain("may be summarized soon");
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
