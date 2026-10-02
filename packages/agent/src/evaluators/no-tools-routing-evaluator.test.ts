import {
  BUILTIN_RESPONSE_HANDLER_EVALUATORS,
  type MessageHandlerResult,
  routeMessageHandlerOutput,
  runResponseHandlerEvaluators,
} from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { hasExplicitNoToolsIntent } from "@/runtime/no-tools-intent";
import { noToolsRoutingEvaluator } from "./no-tools-routing-evaluator";
import { workspaceMutationRoutingEvaluator } from "./workspace-mutation-routing-evaluator";

describe("explicit no-tools intent", () => {
  it.each([
    "Do not use tools. Propose a two-step plan.",
    "Don't call any tools; just answer.",
    "You must not invoke tools.",
    "Never run tools.",
    "Avoid using tools.",
    "Refrain from calling tools.",
    "Use no tools for this task.",
    "Answer without using any tools.",
    "Without tools, propose a plan.",
    "Do not run commands or use tools, and do not create, edit, or delete any files. Instead, propose a brief two-step plan for a future change that would create notes/roadmap.md with a weekly project status. Clearly say the file was not created.",
    "Do not execute shell commands and invoke tools.",
  ])("recognizes the unconditional instruction: %s", (message) => {
    expect(hasExplicitNoToolsIntent(message)).toBe(true);
  });

  it.each([
    "Use the available tools to inspect the repo.",
    "Don't explain how to use tools.",
    "Explain why people must not use tools.",
    "Do not use browser tools; use the file reader.",
    "Do not run commands.",
    "Do not use tools unless verification requires them.",
    "Do not use tools except the file reader.",
    "If possible, do not use tools.",
    "Don't use tools until I approve; this is a conditional request.",
    "Do not use tools other than the browser.",
    "Do not use tools for sending mail.",
    "Do not use tools to create files.",
    "Do not use tools' outputs as proof of completion.",
    "Do not use tools/results in the answer.",
    "Do not use tools names in the answer.",
    'Explain the sentence "do not use tools".',
    "Explain the sentence ‘do not use tools’.",
    "Explain the sentence 'do not use tools'.",
    "Example: `do not use tools`. Now inspect the repo.",
    "Example:\n```text\ndo not use tools\n```\nNow inspect the repo.",
    "> Do not use tools.\nThat is a quote; inspect the repo.",
    "",
  ])(
    "does not turn a scoped ban or example into a blanket ban: %s",
    (message) => {
      expect(hasExplicitNoToolsIntent(message)).toBe(false);
    },
  );
});

async function evaluate(text: string, reply: string) {
  const messageHandler: MessageHandlerResult = {
    processMessage: "RESPOND",
    thought: "",
    plan: {
      contexts: ["code", "files"],
      requiresTool: true,
      candidateActions: ["TASKS_LIST_AGENTS", "WRITE_FILE"],
      parentActionHints: ["DOOLITTLE_CODING"],
      deterministicToolCall: { name: "WRITE_FILE" },
      reply,
    },
  };
  const result = await runResponseHandlerEvaluators({
    runtime: {
      responseHandlerEvaluators: [
        workspaceMutationRoutingEvaluator,
        noToolsRoutingEvaluator,
      ],
      actions: [],
      logger: { warn: vi.fn() },
    } as never,
    message: { content: { text } } as never,
    state: {} as never,
    messageHandler,
    availableContexts: [],
    evaluators: BUILTIN_RESPONSE_HANDLER_EVALUATORS,
  });
  return {
    result,
    messageHandler,
    route: routeMessageHandlerOutput(messageHandler),
  };
}

describe("no-tools SDK routing", () => {
  it("clears tool routes and preserves the answer on the SDK direct-reply path", async () => {
    const reply =
      "1. Plan the weekly status file. 2. Review the plan. The file was not created.";
    const { result, messageHandler, route } = await evaluate(
      "Do not run commands or use tools. Propose a plan for notes/roadmap.md.",
      reply,
    );

    expect(result.errors).toEqual([]);
    expect(result.activeEvaluators).toEqual(["doolittle.no_tools_routing"]);
    expect(messageHandler.plan).toMatchObject({
      requiresTool: false,
      contexts: ["simple"],
      reply,
    });
    expect(messageHandler.plan).not.toHaveProperty("candidateActions");
    expect(messageHandler.plan).not.toHaveProperty("parentActionHints");
    expect(route).toMatchObject({ type: "final_reply", reply });
  });

  it("does not erase the reply for a conflicting no-tools mutation request", async () => {
    const reply = "I cannot create the file without tools; it was not created.";
    const { result, route } = await evaluate(
      "Create notes/roadmap.md. Do not use tools.",
      reply,
    );

    expect(result.activeEvaluators).toEqual(["doolittle.no_tools_routing"]);
    expect(route).toMatchObject({ type: "final_reply", reply });
  });

  it("leaves normal workspace mutations on the native coding route", async () => {
    const { result, messageHandler, route } = await evaluate(
      "Create notes/roadmap.md with a weekly status section.",
      "On it.",
    );

    expect(result.errors).toEqual([]);
    expect(result.activeEvaluators).toEqual([
      "doolittle.workspace_mutation_routing",
    ]);
    expect(messageHandler.plan).toMatchObject({
      requiresTool: true,
      candidateActions: ["DOOLITTLE_CODING"],
    });
    expect(route.type).toBe("planning_needed");
  });
});
