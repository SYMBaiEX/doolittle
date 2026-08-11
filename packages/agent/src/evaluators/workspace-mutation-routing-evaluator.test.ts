import { runResponseHandlerEvaluators } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { DOOLITTLE_CODING_ACTION } from "@/actions/coding-action";
import { workspaceMutationRoutingEvaluator } from "./workspace-mutation-routing-evaluator";

function context(text: string) {
  return {
    runtime: {},
    message: { content: { text } },
    state: {},
    messageHandler: {},
    availableContexts: [],
  } as unknown as Parameters<
    typeof workspaceMutationRoutingEvaluator.shouldRun
  >[0];
}

describe("workspace mutation response-handler evaluator", () => {
  it("routes the reported read-then-write failure through the coding parent", async () => {
    const input = context("Review the repo and write a README.md for it");

    expect(await workspaceMutationRoutingEvaluator.shouldRun(input)).toBe(true);
    expect(await workspaceMutationRoutingEvaluator.evaluate(input)).toEqual(
      expect.objectContaining({
        requiresTool: true,
        addContexts: ["code", "files"],
        clearCandidateActions: true,
        addCandidateActions: [DOOLITTLE_CODING_ACTION],
        clearParentActionHints: true,
        addParentActionHints: [DOOLITTLE_CODING_ACTION],
        clearReply: true,
      }),
    );
  });

  it("does not take over read-only repository questions", async () => {
    expect(
      await workspaceMutationRoutingEvaluator.shouldRun(
        context("Review the repo and tell me what it is"),
      ),
    ).toBe(false);
  });

  it("replaces a broad action surface with only the native coding parent", async () => {
    const input = context("Review the repo and write a README.md for it");
    const messageHandler = {
      processMessage: "RESPOND" as const,
      thought: "",
      plan: {
        contexts: [],
        candidateActions: ["READ_FILE", "TASKS_SPAWN_AGENT"],
        parentActionHints: ["TASKS_SPAWN_AGENT"],
        reply: "I will inspect it now.",
      },
    };

    await runResponseHandlerEvaluators({
      runtime: {
        responseHandlerEvaluators: [workspaceMutationRoutingEvaluator],
        logger: { warn: vi.fn() },
      } as never,
      message: input.message,
      state: input.state,
      messageHandler,
      availableContexts: [],
    });

    expect(messageHandler.plan).toMatchObject({
      requiresTool: true,
      contexts: ["code", "files"],
      candidateActions: [DOOLITTLE_CODING_ACTION],
      parentActionHints: [DOOLITTLE_CODING_ACTION],
    });
    expect(messageHandler.plan).not.toHaveProperty("reply");
  });
});
