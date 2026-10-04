import {
  type Action,
  AgentRuntime,
  BUILTIN_RESPONSE_HANDLER_FIELD_EVALUATORS,
  ChannelType,
  DefaultMessageService,
  type GenerateTextParams,
  InMemoryDatabaseAdapter,
  type Memory,
  ModelType,
  OPTIMIZED_PROMPT_SERVICE,
} from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEvalModelInputObservationsPlugin } from "./plugin-registry/eval-model-input-observations";

const toolName = "SYNTHETIC_TOOL_NAME_CANARY";
const pathCanary = "/PUBLIC_SYNTHETIC_PATH_CANARY/no-file-is-written";
const argumentCanary = "PUBLIC_SYNTHETIC_ARGUMENT_CANARY";
const resultCanary = "PUBLIC_SYNTHETIC_RESULT_TEXT_CANARY_";
const userCanary = "PUBLIC_SYNTHETIC_USER_TEXT_CANARY";
const promptCanary = "PUBLIC_SYNTHETIC_OPTIMIZED_PROMPT_CANARY";
const finalReply = "The bounded synthetic task is complete.";
const argumentsFixture = { path: pathCanary, note: argumentCanary };
const canaries = [
  toolName,
  pathCanary,
  argumentCanary,
  resultCanary,
  userCanary,
  promptCanary,
];
const fileModelCallCeiling = 16;
let fileModelCalls = 0;

beforeEach(() => {
  vi.stubEnv("ELIZA_TRAJECTORY_RECORDING", "false");
  vi.stubEnv("ELIZA_INFERENCE_TIMING", "false");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Network is forbidden in this fixture.");
    }),
  );
});

afterEach(() => {
  try {
    expect(fetch).not.toHaveBeenCalled();
    expect(fileModelCalls).toBeLessThanOrEqual(fileModelCallCeiling);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

type InputObservation = {
  kind: "input";
  version: number;
  slot: string;
  requestedSlot: string;
  messageTextChars: number | null;
  toolCallArgumentChars: number | null;
  toolResultTextChars: number | null;
  partial: boolean;
};

type NativePartCounts = {
  slot: string;
  calls: number;
  results: number;
  resultTextChars: number;
  selectedPlannerPrompt: boolean;
};

function inputRows(rows: object[]) {
  return rows.filter(
    (row): row is InputObservation => "kind" in row && row.kind === "input",
  );
}

function expectContentFree(rows: object[]) {
  const serialized = JSON.stringify(rows);
  for (const canary of canaries) expect(serialized).not.toContain(canary);
  expect(serialized).not.toContain(finalReply);
}

// Inspect only known public synthetic inputs in memory, retaining counts rather
// than strings. The SDK creates the native call/result parts; this is not a
// reconstructed planner prompt or a manually invoked observation hook.
function nativePartCounts(slot: string, params: GenerateTextParams) {
  const counts: NativePartCounts = {
    slot,
    calls: 0,
    results: 0,
    resultTextChars: 0,
    selectedPlannerPrompt: false,
  };
  for (const message of params.messages ?? []) {
    if (typeof message.content === "string") {
      if (message.content.includes(promptCanary))
        counts.selectedPlannerPrompt = true;
      continue;
    }
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type === "tool-call") counts.calls++;
      if (part.type !== "tool-result") continue;
      counts.results++;
      const output = part.output;
      if (
        output &&
        typeof output === "object" &&
        !Array.isArray(output) &&
        "type" in output &&
        "value" in output &&
        (output.type === "text" || output.type === "error-text") &&
        typeof output.value === "string"
      )
        counts.resultTextChars += output.value.length;
    }
  }
  return counts;
}

async function fixture(replies: Array<{ slot: string; text: string }>) {
  const runtime = new AgentRuntime({
    character: {
      name: "Public synthetic size fixture",
      bio: ["Synthetic only."],
    },
    adapter: new InMemoryDatabaseAdapter(),
    disableBasicCapabilities: true,
    enableTrajectories: false,
    logLevel: "fatal",
    fetch,
  });
  const rows: object[] = [];
  const inputs: NativePartCounts[] = [];
  const optimizedTasks: string[] = [];
  const remaining = [...replies];
  const callModel = async (slot: string, params: GenerateTextParams) => {
    if (++fileModelCalls > fileModelCallCeiling)
      throw new Error("File model call ceiling exceeded.");
    const reply = remaining.shift();
    if (!reply || reply.slot !== slot)
      throw new Error("Fixed fixture model call budget or order exceeded.");
    inputs.push(nativePartCounts(slot, params));
    return reply.text;
  };
  try {
    for (const level of [
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
    ] as const)
      vi.spyOn(runtime.logger, level).mockImplementation(() => undefined);
    // Leave AgentRuntime.useModel and public pipeline dispatch intact. Only
    // message-service state/service I/O is a volatile fixture, as in the existing
    // installed-SDK controls; runtime.initialize is deliberately never called.
    vi.spyOn(runtime, "getService").mockImplementation((name) =>
      name === OPTIMIZED_PROMPT_SERVICE
        ? ({
            getPrompt(task: string) {
              if (task !== "should_respond" && task !== "action_planner")
                throw new Error("Unexpected fixture prompt task.");
              optimizedTasks.push(task);
              // A distinct service prompt prevents ambient artifact fallback.
              return {
                prompt: `${promptCanary} ${task}`,
                optimizerSource: "instruction-search",
              };
            },
          } as unknown as ReturnType<typeof runtime.getService>)
        : null,
    );
    vi.spyOn(runtime, "composeState").mockResolvedValue({
      values: {},
      data: {},
      text: "",
    });
    vi.spyOn(runtime, "runActionsByMode").mockResolvedValue([]);
    vi.spyOn(runtime, "queueEmbeddingGeneration").mockResolvedValue(undefined);
    runtime.contexts.tryRegisterMany([{ id: "code" }]);
    for (const field of BUILTIN_RESPONSE_HANDLER_FIELD_EVALUATORS)
      runtime.registerResponseHandlerFieldEvaluator(field);
    await runtime.registerPlugin(
      createEvalModelInputObservationsPlugin({
        enabled: true,
        sink: (row) => rows.push(row),
      }),
    );
    await runtime.registerPlugin({
      name: "synthetic-size-model-fixture",
      description: "Finite in-memory model replies; no provider backend.",
      models: {
        [ModelType.RESPONSE_HANDLER]: (_runtime, params: GenerateTextParams) =>
          callModel(ModelType.RESPONSE_HANDLER, params),
        [ModelType.ACTION_PLANNER]: (_runtime, params: GenerateTextParams) =>
          callModel(ModelType.ACTION_PLANNER, params),
        [ModelType.TEXT_SMALL]: (_runtime, params: GenerateTextParams) =>
          callModel(ModelType.TEXT_SMALL, params),
      },
    });
    return { runtime, rows, inputs, optimizedTasks, remaining };
  } catch (error) {
    await runtime.stop();
    throw error;
  }
}

async function runToolLoop(output: string) {
  const f = await fixture([
    {
      slot: ModelType.RESPONSE_HANDLER,
      text: JSON.stringify({
        shouldRespond: "RESPOND",
        contexts: ["code"],
        intents: [],
        candidateActionNames: [toolName],
        requiresTool: true,
        replyText: "",
        facts: [],
        relationships: [],
        addressedTo: [],
        topics: [],
        emotion: "none",
      }),
    },
    {
      slot: ModelType.ACTION_PLANNER,
      text: JSON.stringify({
        toolCalls: [{ name: toolName, params: argumentsFixture }],
      }),
    },
    {
      slot: ModelType.RESPONSE_HANDLER,
      text: JSON.stringify({
        success: true,
        decision: "FINISH",
        messageToUser: finalReply,
      }),
    },
  ]);
  const handler = vi.fn(async (_runtime, _message, _state, options) => {
    expect(options?.parameters).toEqual(argumentsFixture);
    return { success: true, text: output };
  });
  const action: Action = {
    name: toolName,
    description: "Return public synthetic data; never access the example path.",
    contexts: ["code"],
    // Plugin registration otherwise inherits the real coding context's owner
    // gate. This synthetic no-I/O action is explicitly available to the user.
    roleGate: { minRole: "USER" },
    examples: [],
    validate: async () => true,
    parameters: [
      {
        name: "path",
        description: "Public synthetic unused path.",
        required: true,
        schema: { type: "string" },
      },
      {
        name: "note",
        description: "Public synthetic argument.",
        required: true,
        schema: { type: "string" },
      },
    ],
    handler,
  };
  try {
    await f.runtime.registerPlugin({
      name: "synthetic-size-tool-fixture",
      description: "One in-memory tool, with no filesystem or process I/O.",
      actions: [action],
    });
    const message: Memory = {
      id: "00000000-0000-4000-8000-000000000042",
      agentId: f.runtime.agentId,
      entityId: "00000000-0000-4000-8000-000000000043",
      roomId: "00000000-0000-4000-8000-000000000045",
      content: { text: userCanary, channelType: ChannelType.DM },
    };
    const result = await new DefaultMessageService().handleMessage(
      f.runtime,
      message,
      undefined,
      { timeoutDuration: 2_000, maxRetries: 0 },
    );
    expect(result.didRespond).toBe(true);
    expect(result.responseContent?.text).toBe(finalReply);
    expect(
      (
        result.state?.data?.actionResults as Array<{
          success: boolean;
          error?: unknown;
        }>
      )?.map(({ success, error }) => ({ success, error })),
    ).toEqual([{ success: true, error: undefined }]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(f.remaining).toHaveLength(0);
    expect(f.inputs.map((input) => input.slot)).toEqual([
      ModelType.RESPONSE_HANDLER,
      ModelType.ACTION_PLANNER,
      ModelType.RESPONSE_HANDLER,
    ]);
    expect(f.inputs[1].selectedPlannerPrompt).toBe(true);
    expect(f.optimizedTasks).toEqual(["should_respond", "action_planner"]);
    expect(f.runtime.turnControllers.hasActiveTurn(message.roomId)).toBe(false);
    const inputs = inputRows(f.rows);
    expect(inputs).toHaveLength(3);
    expect(inputs.every((row) => row.version === 2)).toBe(true);
    expectContentFree(f.rows);
    const evaluatorInput = inputs[2];
    expect(f.inputs[2]).toMatchObject({ calls: 1, results: 1 });
    expect(evaluatorInput).toMatchObject({
      requestedSlot: ModelType.RESPONSE_HANDLER,
      messageTextChars: expect.any(Number),
      toolCallArgumentChars: JSON.stringify(argumentsFixture).length,
      toolResultTextChars: f.inputs[2].resultTextChars,
      partial: false,
    });
    expect(evaluatorInput.toolResultTextChars).toBeGreaterThanOrEqual(
      output.length,
    );
    return { evaluatorInput, outcome: result.responseContent?.text };
  } finally {
    await f.runtime.stop();
  }
}

describe("installed SDK native tool input size observation", () => {
  it("counts genuine SDK parts and observes output growth without changing the outcome", async () => {
    const shortOutput = `${resultCanary}${"s".repeat(24)}`;
    const longOutput = `${resultCanary}${"s".repeat(4_096)}`;
    const callsBefore = fileModelCalls;
    const short = await runToolLoop(shortOutput);
    const long = await runToolLoop(longOutput);
    expect(fileModelCalls - callsBefore).toBe(6);
    expect(long.outcome).toBe(short.outcome);
    expect(long.evaluatorInput.messageTextChars).toBe(
      short.evaluatorInput.messageTextChars,
    );
    expect(long.evaluatorInput.toolCallArgumentChars).toBe(
      short.evaluatorInput.toolCallArgumentChars,
    );
    expect(
      (long.evaluatorInput.toolResultTextChars as number) -
        (short.evaluatorInput.toolResultTextChars as number),
    ).toBe(longOutput.length - shortOutput.length);
  }, 5_000);

  it("keeps an unknown part partial and unavailable through real public model hooks", async () => {
    const f = await fixture([{ slot: ModelType.TEXT_SMALL, text: finalReply }]);
    try {
      // This adversarial request is intentionally not an SDK-created tool part.
      // It traverses actual useModel/plugin hooks, not fabricated hook rows.
      const params = {
        messages: [
          {
            role: "user",
            content: [{ type: "unknown-synthetic-part", text: userCanary }],
          },
        ],
      } as unknown as GenerateTextParams;
      const callsBefore = fileModelCalls;
      await expect(
        f.runtime.useModel(ModelType.TEXT_SMALL, params),
      ).resolves.toBe(finalReply);
      expect(fileModelCalls - callsBefore).toBe(1);
      expect(f.remaining).toHaveLength(0);
      const inputs = inputRows(f.rows);
      expect(inputs).toHaveLength(1);
      expect(inputs[0]).toMatchObject({
        version: 2,
        partial: true,
        messageTextChars: null,
        toolCallArgumentChars: null,
        toolResultTextChars: null,
      });
      expectContentFree(f.rows);
    } finally {
      await f.runtime.stop();
    }
  }, 5_000);
});
