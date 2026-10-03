import {
  type Action,
  BUILTIN_RESPONSE_HANDLER_FIELD_EVALUATORS,
  ChannelType,
  ContextRegistry,
  DefaultMessageService,
  type IAgentRuntime,
  type Memory,
  ModelType,
  OPTIMIZED_PROMPT_SERVICE,
  ResponseHandlerFieldRegistry,
  runV5MessageRuntimeStage1,
  TurnControllerRegistry,
} from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("ELIZA_TRAJECTORY_RECORDING", "false");
  vi.stubEnv("ELIZA_INFERENCE_TIMING", "false");
});
afterEach(() => vi.unstubAllEnvs());

const messageId = "00000000-0000-4000-8000-000000000002";
const roomId = "00000000-0000-4000-8000-000000000005";
const syntheticPlannerPrompt = "Synthetic bounded in-memory planner.";

// Exercise the installed SDK, not a copied planner or a mocked message service.
// The runtime has only in-memory I/O and two synthetic actions. Model responses
// are fixed and bounded; no provider, subprocess, filesystem or API is used.
function fixture(stopAfterFirstAction = false) {
  const modelTypes: string[] = [];
  const executed: string[] = [];
  const optimizedTasks: string[] = [];
  const plannerTemplateSelections: boolean[] = [];
  // The installed planner falls back to ambient disk artifacts when this
  // service is absent OR its result equals the bundled baseline. Supply a
  // distinct bounded prompt through the real service contract instead.
  const optimizedPromptService = {
    getPrompt: (task: string) => {
      optimizedTasks.push(task);
      if (task === "should_respond") return null;
      if (task !== "action_planner")
        throw new Error("Unexpected synthetic prompt task.");
      return {
        prompt: syntheticPlannerPrompt,
        optimizerSource: "instruction-search",
      };
    },
  };
  const actions: Action[] = ["SYNTHETIC_FIRST", "SYNTHETIC_SECOND"].map(
    (name) => ({
      name,
      description: "Synthetic boundary action.",
      contexts: ["code"],
      examples: [],
      validate: async () => true,
      handler: async () => {
        executed.push(name);
        return {
          success: true,
          text: "Synthetic result.",
          ...(stopAfterFirstAction ? { continueChain: false } : {}),
        };
      },
    }),
  );
  const replies = [
    JSON.stringify({
      shouldRespond: "RESPOND",
      contexts: ["code"],
      intents: [],
      candidateActionNames: actions.map((action) => action.name),
      replyText: "",
      facts: [],
      relationships: [],
      addressedTo: [],
      topics: [],
      emotion: "none",
    }),
    JSON.stringify({
      toolCalls: [{ name: actions[0].name, params: {} }],
    }),
    JSON.stringify({ success: true, decision: "CONTINUE" }),
    JSON.stringify({
      toolCalls: [{ name: actions[1].name, params: {} }],
    }),
    JSON.stringify({
      success: true,
      decision: "FINISH",
      messageToUser: "Synthetic completion.",
    }),
  ];
  const fields = new ResponseHandlerFieldRegistry();
  for (const field of BUILTIN_RESPONSE_HANDLER_FIELD_EVALUATORS) {
    fields.register(field);
  }
  const state = { values: {}, data: {}, text: "" };
  const noop = async () => undefined;
  const runtime = {
    agentId: "00000000-0000-4000-8000-000000000001",
    character: { name: "Synthetic agent" },
    actions,
    providers: [],
    contexts: new ContextRegistry([{ id: "code" }]),
    responseHandlerFieldRegistry: fields,
    turnControllers: new TurnControllerRegistry(),
    stateCache: new Map(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    getSetting: () => undefined,
    getService: (name: string) =>
      name === OPTIMIZED_PROMPT_SERVICE ? optimizedPromptService : null,
    getServiceLoadPromise: async () => ({ run: noop }),
    getModel: () => ({}),
    getRoom: async () => null,
    getRoomsByIds: async () => [],
    getParticipantUserState: async () => null,
    getMemoryById: async () => null,
    createMemory: async (memory: Memory) => memory.id,
    updateMemory: noop,
    queueEmbeddingGeneration: noop,
    composeState: async () => state,
    emitEvent: noop,
    runActionsByMode: noop,
    applyPipelineHooks: noop,
    startRun: () => "00000000-0000-4000-8000-000000000004",
    useModel: async (
      modelType: string,
      params: { messages?: Array<{ content?: unknown }> },
    ) => {
      modelTypes.push(modelType);
      if (modelType === ModelType.ACTION_PLANNER) {
        plannerTemplateSelections.push(
          params.messages?.some(
            ({ content }) =>
              typeof content === "string" &&
              content.includes(syntheticPlannerPrompt),
          ) === true,
        );
      }
      const reply = replies.shift();
      if (reply === undefined)
        throw new Error("Synthetic model budget exceeded.");
      return reply;
    },
  } as unknown as IAgentRuntime;
  const message: Memory = {
    id: messageId,
    agentId: runtime.agentId,
    entityId: "00000000-0000-4000-8000-000000000003",
    roomId,
    content: {
      text: "Perform the synthetic boundary task.",
      channelType: ChannelType.DM,
    },
  };
  return {
    runtime,
    message,
    state,
    executed,
    modelTypes,
    optimizedTasks,
    plannerTemplateSelections,
  };
}

describe("installed SDK planner yield boundary", () => {
  it("executes two actions inside handleMessage despite the legacy one-iteration option", async () => {
    const f = fixture();
    const result = await new DefaultMessageService().handleMessage(
      f.runtime,
      f.message,
      undefined,
      {
        useMultiStep: true,
        maxMultiStepIterations: 1,
        continueAfterActions: false,
        timeoutDuration: 2_000,
      },
    );
    expect(result.didRespond).toBe(true);
    expect(f.executed).toEqual(["SYNTHETIC_FIRST", "SYNTHETIC_SECOND"]);
    expect(f.modelTypes).toEqual([
      ModelType.RESPONSE_HANDLER,
      ModelType.ACTION_PLANNER,
      ModelType.RESPONSE_HANDLER,
      ModelType.ACTION_PLANNER,
      ModelType.RESPONSE_HANDLER,
    ]);
    expect(f.runtime.turnControllers.hasActiveTurn(roomId)).toBe(false);
    expect(f.optimizedTasks).toEqual([
      "should_respond",
      "action_planner",
      "action_planner",
    ]);
    expect(f.plannerTemplateSelections).toEqual([true, true]);
  }, 5_000);

  it("the public Stage1 tool-call ceiling refuses the second action rather than yielding normally", async () => {
    const f = fixture();
    await expect(
      runV5MessageRuntimeStage1({
        runtime: f.runtime,
        message: f.message,
        state: f.state,
        responseId: messageId,
        plannerLoopConfig: { maxToolCalls: 1 },
      }),
    ).rejects.toMatchObject({ kind: "tool_calls", max: 1, observed: 2 });
    expect(f.executed).toEqual(["SYNTHETIC_FIRST"]);
    expect(f.modelTypes).toHaveLength(4);
    expect(f.optimizedTasks).toEqual([
      "should_respond",
      "action_planner",
      "action_planner",
    ]);
    expect(f.plannerTemplateSelections).toEqual([true, true]);
  }, 5_000);

  it("an actual terminal action receipt stops before requesting the second action", async () => {
    const f = fixture(true);
    const outcome = await runV5MessageRuntimeStage1({
      runtime: f.runtime,
      message: f.message,
      state: f.state,
      responseId: messageId,
    });
    expect(outcome.kind).toBe("planned_reply");
    expect(f.executed).toEqual(["SYNTHETIC_FIRST"]);
    expect(f.modelTypes).toEqual([
      ModelType.RESPONSE_HANDLER,
      ModelType.ACTION_PLANNER,
    ]);
    expect(f.optimizedTasks).toEqual(["should_respond", "action_planner"]);
    expect(f.plannerTemplateSelections).toEqual([true]);
  }, 5_000);
});
