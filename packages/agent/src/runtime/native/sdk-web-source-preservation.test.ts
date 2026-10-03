import {
  type Action,
  type ActionResult,
  AgentRuntime,
  BUILTIN_RESPONSE_HANDLER_FIELD_EVALUATORS,
  ChannelType,
  InMemoryDatabaseAdapter,
  type Memory,
  ModelType,
  OPTIMIZED_PROMPT_SERVICE,
  runV5MessageRuntimeStage1,
} from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sourceUrl = "https://example.invalid/synthetic-source.ts";
const answer = {
  values: ["alpha", "beta"],
  member: "syntheticMode",
  declaration: 'export type SyntheticMode = "alpha" | "beta";',
  source: sourceUrl,
};
const exactAnswer = JSON.stringify(answer);
const syntheticPrompt =
  "Bounded in-memory source-preservation characterization.";

beforeEach(() => {
  vi.stubEnv("ELIZA_TRAJECTORY_RECORDING", "false");
  vi.stubEnv("ELIZA_INFERENCE_TIMING", "false");
  vi.stubEnv("ACTION_ROLE_POLICY", "{}");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Synthetic network forbidden.");
    }),
  );
});

afterEach(() => {
  try {
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

async function runFixture(
  actionName: string,
  actionResult: ActionResult,
  modelAnswer = exactAnswer,
) {
  const runtime = new AgentRuntime({
    character: { name: "Synthetic source fixture", bio: ["Synthetic."] },
    adapter: new InMemoryDatabaseAdapter(),
    enableTrajectories: false,
    disableBasicCapabilities: true,
    logLevel: "fatal",
    fetch: globalThis.fetch,
  });
  const modelTypes: string[] = [];
  const emittedModelAnswers: string[] = [];
  const executed: string[] = [];
  const state = { values: {}, data: {}, text: "" };
  const originalResult = structuredClone(actionResult);
  const stopped = vi.spyOn(runtime, "stop");
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
    // Never initialize: public registrations plus in-memory state are enough.
    // A distinct optimized prompt avoids the SDK's ambient disk fallback.
    vi.spyOn(runtime, "getService").mockImplementation((service) =>
      service === OPTIMIZED_PROMPT_SERVICE
        ? ({
            getPrompt: (task: string) => {
              if (!["should_respond", "action_planner"].includes(task))
                throw new Error("Unexpected synthetic prompt task.");
              return {
                prompt: `${syntheticPrompt} ${task}`,
                optimizerSource: "instruction-search",
              };
            },
          } as unknown as ReturnType<typeof runtime.getService>)
        : null,
    );
    vi.spyOn(runtime, "composeState").mockImplementation(async () => state);
    vi.spyOn(runtime, "runActionsByMode").mockResolvedValue([]);
    for (const field of BUILTIN_RESPONSE_HANDLER_FIELD_EVALUATORS)
      runtime.registerResponseHandlerFieldEvaluator(field);
    const action: Action = {
      name: actionName,
      description:
        "Synthetic evidence action; no retrieval or delivery occurs.",
      contexts: ["web"],
      examples: [],
      validate: async () => true,
      handler: async () => {
        executed.push(actionName);
        if (executed.length > 1)
          throw new Error("Synthetic action budget exceeded.");
        return actionResult;
      },
    };
    const replies = [
      JSON.stringify({
        shouldRespond: "RESPOND",
        contexts: ["web"],
        intents: [],
        candidateActionNames: [actionName],
        requiresTool: true,
        replyText: "",
        facts: [],
        relationships: [],
        addressedTo: [],
        topics: [],
        emotion: "none",
      }),
      JSON.stringify({ toolCalls: [{ name: actionName, params: {} }] }),
      JSON.stringify({
        success: actionResult.success,
        decision: "FINISH",
        messageToUser: modelAnswer,
      }),
    ];
    const model = async (
      _runtime: unknown,
      _params: unknown,
      modelType: string,
    ) => {
      modelTypes.push(modelType);
      const reply = replies.shift();
      if (reply === undefined)
        throw new Error("Synthetic model budget exceeded.");
      if (modelTypes.length === 3) emittedModelAnswers.push(modelAnswer);
      return reply;
    };
    await runtime.registerPlugin({
      name: "synthetic-source-preservation",
      description: "Finite registered SDK models/actions; no live providers.",
      actions: [action],
      models: {
        [ModelType.RESPONSE_HANDLER]: (runtime, params) =>
          model(runtime, params, ModelType.RESPONSE_HANDLER),
        [ModelType.ACTION_PLANNER]: (runtime, params) =>
          model(runtime, params, ModelType.ACTION_PLANNER),
      },
    });
    const message: Memory = {
      id: "00000000-0000-4000-8000-000000000002",
      agentId: runtime.agentId,
      entityId: runtime.agentId,
      roomId: "00000000-0000-4000-8000-000000000003",
      content: {
        text: `Use the synthetic evidence action and return the supplied literal JSON answer with source ${sourceUrl}.`,
        channelType: ChannelType.DM,
      },
    };
    const outcome = await runV5MessageRuntimeStage1({
      runtime,
      message,
      state,
      responseId: "00000000-0000-4000-8000-000000000002",
      plannerLoopConfig: { maxToolCalls: 1, compactionEnabled: false },
    });
    expect(outcome.kind).toBe("planned_reply");
    if (outcome.kind !== "planned_reply")
      throw new Error("Synthetic fixture did not produce a planned reply.");
    expect(executed).toEqual([actionName]);
    expect(modelTypes).toEqual([
      ModelType.RESPONSE_HANDLER,
      ModelType.ACTION_PLANNER,
      ModelType.RESPONSE_HANDLER,
    ]);
    expect(replies).toEqual([]);
    expect(emittedModelAnswers).toEqual([modelAnswer]);
    expect(actionResult).toEqual(originalResult);
    return outcome.result.responseContent?.text;
  } finally {
    await runtime.stop();
    expect(stopped).toHaveBeenCalledTimes(1);
  }
}

describe("installed pinned SDK final web-source preservation", () => {
  it("successful WEB_FETCH data.url preserves an exact JSON citation", async () => {
    const response = await runFixture("WEB_FETCH", {
      success: true,
      text: answer.declaration,
      data: {
        actionName: "WEB_FETCH",
        url: sourceUrl,
        value: answer.declaration,
      },
    });
    // Unpatched beta.7 mistakes this retrieved URL for media and changes only
    // the exact citation to an empty string. No answer reconstruction is used.
    expect(response).toBe(exactAnswer);
    expect(JSON.parse(response ?? "")).toEqual(answer);
  }, 5_000);

  it.each(["imageUrl", "videoUrl", "audioUrl", "mediaUrl"])(
    "successful explicit %s delivery removes only its media URL",
    async (field) => {
      const imageUrl = "https://example.invalid/generated-image.png";
      const response = await runFixture(
        "SYNTHETIC_IMAGE",
        {
          success: true,
          text: "Synthetic delivered image receipt.",
          data: { actionName: "SYNTHETIC_IMAGE", [field]: imageUrl },
        },
        JSON.stringify({ ...answer, image: imageUrl }),
      );
      expect(response).toBe(JSON.stringify({ ...answer, image: "" }));
    },
    5_000,
  );

  it.each(["image", "video", "audio"])(
    "generic url with explicit %s mediaType retains media delivery behavior",
    async (mediaType) => {
      const response = await runFixture("SYNTHETIC_DELIVERY", {
        success: true,
        text: "Synthetic media delivery receipt.",
        data: { actionName: "SYNTHETIC_DELIVERY", mediaType, url: sourceUrl },
      });
      // Neither action name nor the URL's .ts extension qualifies this URL.
      expect(response).toBe(JSON.stringify({ ...answer, source: "" }));
    },
    5_000,
  );

  it.each([undefined, null, "document", "Image", "image/png", 1])(
    "generic nonmedia url with mediaType=%s preserves its citation",
    async (mediaType) => {
      const response = await runFixture("SYNTHETIC_DOCUMENT", {
        success: true,
        text: "Synthetic retrieved document receipt.",
        data: { actionName: "SYNTHETIC_DOCUMENT", mediaType, url: sourceUrl },
      });
      expect(response).toBe(exactAnswer);
    },
    5_000,
  );

  it.each([
    {
      label: "failed generic typed media delivery",
      name: "SYNTHETIC_DELIVERY",
      success: false,
      data: {
        actionName: "SYNTHETIC_DELIVERY",
        mediaType: "image",
        url: sourceUrl,
      },
    },
    {
      label: "failed web fetch",
      name: "WEB_FETCH",
      success: false,
      data: { actionName: "WEB_FETCH", url: sourceUrl },
    },
    {
      label: "failed media delivery",
      name: "SYNTHETIC_IMAGE",
      success: false,
      data: { actionName: "SYNTHETIC_IMAGE", imageUrl: sourceUrl },
    },
    {
      label: "successful result without a delivered URL",
      name: "WEB_FETCH",
      success: true,
      data: { actionName: "WEB_FETCH", sourceUrl },
    },
  ])(
    "$label retains the model's exact JSON citation",
    async (control) => {
      const response = await runFixture(control.name, {
        success: control.success,
        text: "Synthetic control receipt.",
        data: control.data,
      });
      expect(response).toBe(exactAnswer);
    },
    5_000,
  );
});
