import {
  ChannelType,
  createMessageMemory,
  type ResponseHandlerEvaluator,
} from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { noToolsRoutingEvaluator } from "../../packages/agent/src/evaluators/no-tools-routing-evaluator";
import { workspaceMutationRoutingEvaluator } from "../../packages/agent/src/evaluators/workspace-mutation-routing-evaluator";

type RoutingContext = Parameters<
  NonNullable<ResponseHandlerEvaluator["shouldRun"]>
>[0];

function context(text?: string): RoutingContext {
  const message = createMessageMemory({
    entityId: "00000000-0000-4000-8000-000000000001",
    roomId: "00000000-0000-4000-8000-000000000002",
    content: { text: text ?? "", channelType: ChannelType.API },
  });
  if (text === undefined) delete message.content.text;
  return { message } as RoutingContext;
}

describe("SDK message routing", () => {
  it("keeps an explicit tool ban ahead of workspace mutation routing", () => {
    const input = context(
      "Do not use tools. Explain how to edit src/index.ts.",
    );
    expect(noToolsRoutingEvaluator.shouldRun?.(input)).toBe(true);
    expect(workspaceMutationRoutingEvaluator.shouldRun?.(input)).toBe(false);
  });

  it("routes a requested file edit into the native coding planner", () => {
    const input = context("Edit src/index.ts to fix the failing test.");
    expect(noToolsRoutingEvaluator.shouldRun?.(input)).toBe(false);
    expect(workspaceMutationRoutingEvaluator.shouldRun?.(input)).toBe(true);
  });

  it("accepts SDK memories without text without inventing a tool request", () => {
    const input = context();
    expect(noToolsRoutingEvaluator.shouldRun?.(input)).toBe(false);
    expect(workspaceMutationRoutingEvaluator.shouldRun?.(input)).toBe(false);
  });
});
