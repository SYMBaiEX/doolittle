import {
  type Action,
  AgentRuntime,
  ChannelType,
  InMemoryDatabaseAdapter,
  type Memory,
  ModelType,
  OPTIMIZED_PROMPT_SERVICE,
  promoteSubactionsToActions,
  runSubPlanner,
  type ToolDefinition,
} from "@elizaos/core";
import { toOpenAITools } from "@elizaos/plugin-codex-cli";
import { createSelectedProviderTextModel } from "@plugins/doolittle-plugin/model-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEvalModelInputObservationsPlugin } from "./eval-model-input-observations";
import { createPlannerToolExposurePlugin } from "./planner-tool-exposure";

const plannerPrompt = "Bounded synthetic sub-planner instruction.";
const parentName = "SYNTHETIC_OPERATIONS";
const firstName = `${parentName}_FIRST`;
const secondName = `${parentName}_SECOND`;
const sharedAlias = "SYNTHETIC_SHARED";

beforeEach(() => {
  vi.stubEnv("ELIZA_TRAJECTORY_RECORDING", "false");
  vi.stubEnv("ELIZA_INFERENCE_TIMING", "false");
  // Avoid ambient role-policy configuration; the gate tests use explicit roles.
  vi.stubEnv("ACTION_ROLE_POLICY", "{}");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Synthetic network forbidden.");
    }),
  );
});
afterEach(() => {
  expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
afterEach(() => vi.unstubAllEnvs());

function promotedFixture(failHandler = false) {
  const operations: unknown[] = [];
  const parent: Action = {
    name: parentName,
    description: "Synthetic dispatcher with shared schemas and aliases.",
    descriptionCompressed: "synthetic operations",
    contexts: ["code"],
    roleGate: { minRole: "USER" },
    similes: [sharedAlias, "SYNTHETIC_LEGACY", sharedAlias],
    examples: [],
    parameters: [
      {
        name: "action",
        description: "Synthetic operation.",
        required: false,
        schema: { type: "string", enum: ["first", "second"] },
      },
      {
        name: "payload",
        description: "Synthetic shared payload.",
        required: false,
        schema: {
          type: "object",
          properties: {
            body: {
              type: "string",
              description: "Synthetic detail. ".repeat(16),
            },
            mode: { type: "string", enum: ["alpha", "beta"] },
            counts: { type: "array", items: { type: "integer" } },
          },
          required: ["body"],
        },
      },
    ],
    validate: async () => true,
    handler: async (_runtime, _message, _state, options) => {
      const parameters = options?.parameters;
      operations.push(
        parameters &&
          typeof parameters === "object" &&
          !Array.isArray(parameters)
          ? (parameters as Record<string, unknown>).action
          : undefined,
      );
      if (operations.length > 1)
        throw new Error("Synthetic handler budget exceeded.");
      return {
        success: !failHandler,
        text: "Synthetic result.",
        ...(failHandler
          ? { error: "SYNTHETIC_FAILURE" }
          : { continueChain: false }),
      };
    },
  };
  const actions = [...promoteSubactionsToActions(parent)];
  // Real resolveSubActions must deduplicate repeated string/inline canonical
  // declarations before building the tool list; do not copy its algorithm.
  parent.subActions = [
    ...(parent.subActions ?? []),
    firstName,
    actions.find((action) => action.name === firstName) as Action,
  ];
  return { parent, actions, operations };
}

async function sdkFixture(
  parent: Action,
  actions: Action[],
  selectedName: string,
  args: Record<string, unknown> = {},
  options: {
    exposure?: boolean;
    router?: boolean;
    observations?: boolean;
  } = {},
) {
  const runtime = new AgentRuntime({
    character: { name: "Synthetic sub-planner", bio: ["Synthetic."] },
    adapter: new InMemoryDatabaseAdapter(),
    enableTrajectories: false,
    disableBasicCapabilities: true,
    logLevel: "fatal",
    fetch: globalThis.fetch,
    ...(options.router
      ? {
          settings: {
            runtimeSettings: JSON.stringify({
              model: { provider: "synthetic-sub-planner" },
            }),
          },
        }
      : {}),
  });
  for (const level of [
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "fatal",
  ] as const)
    vi.spyOn(runtime.logger, level).mockImplementation(() => undefined);
  const capturedTools: ToolDefinition[][] = [];
  const originalTools: ToolDefinition[][] = [];
  const observedTools: ToolDefinition[][] = [];
  const observationRows: object[] = [];
  const optimizedTasks: string[] = [];
  let modelCalls = 0;
  let evaluatorCalls = 0;
  // The real SDK has an ambient optimized-planner disk fallback. This public
  // service contract returns a distinct in-memory prompt, so it is never used.
  vi.spyOn(runtime, "getService").mockImplementation((service) => {
    if (service !== OPTIMIZED_PROMPT_SERVICE)
      throw new Error("Unexpected synthetic service.");
    return {
      getPrompt: (task: string) => {
        optimizedTasks.push(task);
        if (task !== "action_planner")
          throw new Error("Unexpected synthetic prompt task.");
        return { prompt: plannerPrompt, optimizerSource: "instruction-search" };
      },
    } as unknown as ReturnType<typeof runtime.getService>;
  });
  const message: Memory = {
    id: "00000000-0000-4000-8000-000000000002",
    agentId: runtime.agentId,
    entityId: runtime.agentId,
    roomId: "00000000-0000-4000-8000-000000000003",
    content: { text: "Synthetic task.", channelType: ChannelType.DM },
  };
  const context: Parameters<typeof runSubPlanner>[0]["context"] = {
    id: "synthetic-context",
    version: "v5",
    events: [
      {
        id: "synthetic-message",
        type: "message",
        message: { role: "user", content: "Synthetic task." },
      },
    ],
  };
  try {
    if (options.exposure !== undefined) {
      // Earlier mutator captures the untouched SDK admission array; it never
      // edits params. No private SDK fields or copied tool builder are used.
      runtime.registerPipelineHook({
        id: "synthetic-original-tools",
        phase: "pre_model",
        position: -95,
        mutatesPrimary: true,
        schedule: "serial",
        handler: (_runtime, context) => {
          if (context.phase === "pre_model") {
            const params = context.params as { tools: ToolDefinition[] };
            originalTools.push(params.tools);
          }
        },
      });
      await runtime.registerPlugin(
        createPlannerToolExposurePlugin({ enabled: options.exposure }),
      );
      runtime.registerPipelineHook({
        id: "synthetic-filtered-tools",
        phase: "pre_model",
        position: 100,
        mutatesPrimary: false,
        schedule: "serial",
        handler: (_runtime, context) => {
          if (context.phase === "pre_model") {
            const params = context.params as { tools: ToolDefinition[] };
            observedTools.push(params.tools);
          }
        },
      });
    }
    if (options.observations)
      await runtime.registerPlugin(
        createEvalModelInputObservationsPlugin({
          enabled: true,
          sink: (row) => observationRows.push(row),
        }),
      );
    // Actual public registration and AgentRuntime/useModel. Neither initialize
    // nor any real provider, service, action, transport or recorder is started.
    await runtime.registerPlugin({
      name: "synthetic-sub-planner",
      description: "In-memory bounded SDK proof.",
      actions,
      models: {
        [ModelType.ACTION_PLANNER]: async (_runtime, params) => {
          modelCalls++;
          if (modelCalls > 1)
            throw new Error("Synthetic model budget exceeded.");
          expect(
            params.messages?.some(
              (message) =>
                typeof message.content === "string" &&
                message.content.includes(plannerPrompt),
            ),
          ).toBe(true);
          capturedTools.push(params.tools ?? []);
          return JSON.stringify({
            toolCalls: [{ name: selectedName, params: args }],
          });
        },
      },
    });
    if (options.router)
      await runtime.registerPlugin({
        name: "doolittle-runtime",
        description: "Synthetic public router registration.",
        priority: 10_000,
        models: {
          [ModelType.ACTION_PLANNER]: createSelectedProviderTextModel(
            ModelType.ACTION_PLANNER,
          ),
        },
      });
  } catch (error) {
    await runtime.stop();
    throw error;
  }
  return {
    runtime,
    capturedTools,
    originalTools,
    observedTools,
    observationRows,
    optimizedTasks,
    counts: () => ({ modelCalls, evaluatorCalls }),
    run: (
      userRoles: Parameters<typeof runSubPlanner>[0]["ctx"]["userRoles"] = [
        "USER",
      ],
    ) =>
      runSubPlanner({
        // beta.7's PlannerRuntime and AgentRuntime declarations disagree on
        // responseSchema typing; this is the actual registered useModel above.
        runtime: runtime as unknown as Parameters<
          typeof runSubPlanner
        >[0]["runtime"],
        action: parent,
        context,
        ctx: { message, activeContexts: ["code"], userRoles },
        config: {
          maxToolCalls: 2,
          maxRepeatedFailures: 2,
          maxUnavailableToolCallRetries: 0,
          maxRequiredToolMisses: 0,
          maxTerminalOnlyContinuations: 0,
          maxTrajectoryPromptTokens: 10_000,
          compactionEnabled: false,
        },
        evaluate: ({ trajectory }) => {
          evaluatorCalls++;
          if (evaluatorCalls > 1)
            throw new Error("Synthetic evaluator budget exceeded.");
          return {
            decision: "FINISH",
            thought: "Synthetic evaluation.",
            success: trajectory.steps.at(-1)?.result?.success === true,
            messageToUser: "Synthetic completion.",
          };
        },
      }),
  };
}

describe("installed SDK sub-planner native tool payload", () => {
  it("multiplies shared schemas through real aliases and real Codex strict translation", async () => {
    const f = promotedFixture();
    const sdk = await sdkFixture(f.parent, f.actions, firstName);
    const canonicalFixture = promotedFixture();
    for (const child of canonicalFixture.actions) {
      if (child.name !== parentName) child.similes = [];
    }
    let canonicalSdk: Awaited<ReturnType<typeof sdkFixture>> | undefined;
    try {
      canonicalSdk = await sdkFixture(
        canonicalFixture.parent,
        canonicalFixture.actions,
        firstName,
      );
      const result = await sdk.run();
      const canonicalResult = await canonicalSdk.run();
      expect(result.status).toBe("finished");
      expect(canonicalResult.status).toBe("finished");
      expect(f.operations).toEqual(["first"]);
      expect(canonicalFixture.operations).toEqual(["first"]);
      expect(sdk.counts()).toEqual({ modelCalls: 1, evaluatorCalls: 0 });
      expect(canonicalSdk.counts()).toEqual({
        modelCalls: 1,
        evaluatorCalls: 0,
      });
      expect(sdk.optimizedTasks).toEqual(["action_planner"]);
      expect(canonicalSdk.optimizedTasks).toEqual(["action_planner"]);
      const tools = sdk.capturedTools[0];
      // The installed root bundle does not export the declared tool builder.
      // Obtain the baseline from another actual runSubPlanner invocation with
      // only the synthetic similes removed; schemas/children stay unchanged.
      const baseline = canonicalSdk.capturedTools[0];
      const canonical = baseline.filter((tool) =>
        [firstName, secondName].includes(tool.name),
      );
      const terminals = tools.filter((tool) =>
        ["REPLY", "IGNORE", "STOP"].includes(tool.name),
      );
      expect(canonical).toHaveLength(2);
      expect(baseline).toHaveLength(5);
      expect(terminals).toHaveLength(3);
      expect(tools).toHaveLength(10);
      expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
      for (const tool of canonical) {
        const observed = tools.filter(
          (candidate) => candidate.name === tool.name,
        );
        expect(observed).toHaveLength(1);
        expect(observed[0].parameters).toEqual(tool.parameters);
      }
      const first = tools.find((tool) => tool.name === firstName);
      const alias = tools.find((tool) => tool.name === sharedAlias);
      expect(alias?.parameters).toBe(first?.parameters);
      const schemaChars = (input: ToolDefinition[]) =>
        input.reduce(
          (sum, tool) => sum + JSON.stringify(tool.parameters).length,
          0,
        );
      const translated = toOpenAITools(tools);
      const translatedBaseline = toOpenAITools(baseline);
      const translatedSchemaChars = translated.reduce(
        (sum, tool) => sum + JSON.stringify(tool.parameters).length,
        0,
      );
      expect(schemaChars(tools)).toBeGreaterThan(schemaChars(baseline) * 3);
      expect(translatedSchemaChars).toBeGreaterThan(schemaChars(tools));
      const numericProof = {
        canonicalChildren: canonical.length,
        terminalTools: terminals.length,
        aliasTools: tools.length - baseline.length,
        baselineTools: baseline.length,
        actualTools: tools.length,
        baselineSchemaChars: schemaChars(baseline),
        actualSchemaChars: schemaChars(tools),
        translatedSchemaChars,
        baselineTranslatedChars: JSON.stringify(translatedBaseline).length,
        actualTranslatedChars: JSON.stringify(translated).length,
      };
      // Only closed numeric synthetic metadata is emitted, never payload text.
      process.stdout.write(`${JSON.stringify(numericProof)}\n`);
      expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
    } finally {
      try {
        await sdk.runtime.stop();
      } finally {
        await canonicalSdk?.runtime.stop();
      }
    }
  }, 3_000);

  it.each([
    [firstName, "first"],
    [secondName, "second"],
    ["FIRST", "first"],
  ])(
    "dispatches a canonical or unambiguous legacy name through the real executor",
    async (name, operation) => {
      const f = promotedFixture();
      const sdk = await sdkFixture(f.parent, f.actions, name);
      try {
        const result = await sdk.run();
        expect(result.status).toBe("finished");
        expect(result.trajectory.steps[0].result?.success).toBe(true);
        expect(f.operations).toEqual([operation]);
        expect(sdk.counts()).toEqual({ modelCalls: 1, evaluatorCalls: 0 });
      } finally {
        await sdk.runtime.stop();
      }
    },
    3_000,
  );

  it("advertises the first shared-alias schema but resolves that alias to the last child", async () => {
    const f = promotedFixture();
    const sdk = await sdkFixture(f.parent, f.actions, sharedAlias);
    try {
      const result = await sdk.run();
      const tools = sdk.capturedTools[0];
      expect(
        tools.find((tool) => tool.name === sharedAlias)?.parameters,
      ).toEqual(tools.find((tool) => tool.name === firstName)?.parameters);
      expect(result.trajectory.steps[0].result?.success).toBe(true);
      expect(f.operations).toEqual(["second"]);
      expect(sdk.counts()).toEqual({ modelCalls: 1, evaluatorCalls: 0 });
    } finally {
      await sdk.runtime.stop();
    }
  }, 3_000);

  it("refuses the first-child discriminator under the shared alias without executing either child", async () => {
    const f = promotedFixture();
    const sdk = await sdkFixture(f.parent, f.actions, sharedAlias, {
      action: "first",
    });
    try {
      const result = await sdk.run();
      expect(result.status).toBe("finished");
      expect(result.trajectory.steps[0].result?.success).toBe(false);
      expect(result.evaluator?.success).toBe(false);
      expect(f.operations).toHaveLength(0);
      expect(sdk.counts()).toEqual({ modelCalls: 1, evaluatorCalls: 1 });
    } finally {
      await sdk.runtime.stop();
    }
  }, 3_000);

  it("preserves canonical argument validation and handler failure without a second model call", async () => {
    for (const failHandler of [false, true]) {
      const f = promotedFixture(failHandler);
      const sdk = await sdkFixture(
        f.parent,
        f.actions,
        firstName,
        failHandler ? {} : { payload: { body: 42 } },
      );
      try {
        const result = await sdk.run();
        expect(result.status).toBe("finished");
        expect(result.trajectory.steps[0].result?.success).toBe(false);
        expect(result.evaluator?.success).toBe(false);
        expect(f.operations).toHaveLength(failHandler ? 1 : 0);
        expect(sdk.counts()).toEqual({ modelCalls: 1, evaluatorCalls: 1 });
      } finally {
        await sdk.runtime.stop();
      }
    }
  }, 3_000);

  it.each(["role", "context"] as const)(
    "rejects unavailable children at the installed %s gate before any model or handler call",
    async (gate) => {
      const f = promotedFixture();
      const child = f.actions.find(
        (action) => action.name === firstName,
      ) as Action;
      if (gate === "role") child.roleGate = { minRole: "ADMIN" };
      else child.contextGate = { anyOf: ["settings"] };
      f.parent.subActions = [child.name];
      const sdk = await sdkFixture(f.parent, f.actions, child.name);
      try {
        await expect(sdk.run()).rejects.toThrow("no sub-actions available");
        expect(sdk.counts()).toEqual({ modelCalls: 0, evaluatorCalls: 0 });
        expect(f.operations).toHaveLength(0);
        expect(sdk.capturedTools).toHaveLength(0);
      } finally {
        await sdk.runtime.stop();
      }
    },
    3_000,
  );
});

describe("opt-in SDK alias advertisement policy", () => {
  it("reduces native and real Codex payload on both router legs before observers without altering original tools", async () => {
    const f = promotedFixture();
    const sdk = await sdkFixture(
      f.parent,
      f.actions,
      firstName,
      {},
      {
        exposure: true,
        router: true,
        observations: true,
      },
    );
    try {
      const result = await sdk.run();
      expect(result.status).toBe("finished");
      expect(f.operations).toEqual(["first"]);
      expect(sdk.counts()).toEqual({ modelCalls: 1, evaluatorCalls: 0 });
      expect(sdk.originalTools.map((tools) => tools.length)).toEqual([10, 6]);
      expect(sdk.observedTools.map((tools) => tools.length)).toEqual([6, 6]);
      expect(sdk.observedTools[1]).toBe(sdk.observedTools[0]);
      expect(sdk.capturedTools[0]).toBe(sdk.observedTools[1]);
      const original = sdk.originalTools[0];
      const reduced = sdk.capturedTools[0];
      expect(original).toHaveLength(10);
      expect(reduced.map((tool) => tool.name)).toEqual([
        firstName,
        secondName,
        parentName,
        "REPLY",
        "IGNORE",
        "STOP",
      ]);
      for (const retained of reduced) {
        expect(original.find((tool) => tool.name === retained.name)).toBe(
          retained,
        );
      }
      expect(original.find((tool) => tool.name === sharedAlias)).toBeDefined();
      const inputs = sdk.observationRows.filter(
        (row) => (row as { kind: string }).kind === "input",
      );
      expect(inputs).toHaveLength(2);
      expect(inputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ordinal: 1, toolCount: 6 }),
          expect.objectContaining({ ordinal: 2, toolCount: 6 }),
        ]),
      );
      const settlements = sdk.observationRows.filter(
        (row) => (row as { kind: string }).kind === "settlement",
      );
      expect(settlements).toHaveLength(2);
      expect(settlements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ordinal: 1,
            association: "same-params-object",
          }),
          expect.objectContaining({
            ordinal: 2,
            association: "same-params-object",
          }),
        ]),
      );
      const schemaChars = (tools: ToolDefinition[]) =>
        tools.reduce(
          (sum, tool) => sum + JSON.stringify(tool.parameters).length,
          0,
        );
      const translatedOriginal = toOpenAITools(original);
      const translatedReduced = toOpenAITools(reduced);
      expect(schemaChars(reduced)).toBeLessThan(schemaChars(original) * 0.65);
      expect(JSON.stringify(translatedReduced).length).toBeLessThan(
        JSON.stringify(translatedOriginal).length * 0.65,
      );
      process.stdout.write(
        `${JSON.stringify({
          exposureOriginalTools: original.length,
          exposureReducedTools: reduced.length,
          exposureOriginalSchemaChars: schemaChars(original),
          exposureReducedSchemaChars: schemaChars(reduced),
          exposureOriginalTranslatedChars:
            JSON.stringify(translatedOriginal).length,
          exposureReducedTranslatedChars:
            JSON.stringify(translatedReduced).length,
        })}\n`,
      );
    } finally {
      await sdk.runtime.stop();
    }
  }, 3_000);

  it.each([
    [firstName, "first"],
    [secondName, "second"],
    ["FIRST", "first"],
    [sharedAlias, "second"],
    ["SYNTHETIC_LEGACY", "second"],
    [parentName, "second"],
  ])(
    "preserves SDK canonical/removed-legacy dispatch for %s",
    async (name, operation) => {
      const f = promotedFixture();
      const sdk = await sdkFixture(
        f.parent,
        f.actions,
        name,
        {},
        { exposure: true },
      );
      try {
        const result = await sdk.run();
        expect(result.status).toBe("finished");
        expect(result.trajectory.steps[0].result?.success).toBe(true);
        expect(f.operations).toEqual([operation]);
        expect(sdk.originalTools[0]).toHaveLength(10);
        expect(sdk.capturedTools[0]).toHaveLength(6);
        if (["FIRST", sharedAlias, "SYNTHETIC_LEGACY"].includes(name)) {
          expect(sdk.capturedTools[0].some((tool) => tool.name === name)).toBe(
            false,
          );
          expect(sdk.originalTools[0].some((tool) => tool.name === name)).toBe(
            true,
          );
        }
        expect(sdk.counts()).toEqual({ modelCalls: 1, evaluatorCalls: 0 });
      } finally {
        await sdk.runtime.stop();
      }
    },
    3_000,
  );

  it.each(["shared-discriminator", "arguments", "handler"])(
    "preserves refusal/failure for %s",
    async (failure) => {
      const f = promotedFixture(failure === "handler");
      const sdk = await sdkFixture(
        f.parent,
        f.actions,
        failure === "shared-discriminator" ? sharedAlias : firstName,
        failure === "shared-discriminator"
          ? { action: "first" }
          : failure === "arguments"
            ? { payload: { body: 42 } }
            : {},
        { exposure: true },
      );
      try {
        const result = await sdk.run();
        expect(result.status).toBe("finished");
        expect(result.trajectory.steps[0].result?.success).toBe(false);
        expect(result.evaluator?.success).toBe(false);
        expect(f.operations).toHaveLength(failure === "handler" ? 1 : 0);
        expect(sdk.capturedTools[0]).toHaveLength(6);
        expect(sdk.counts()).toEqual({ modelCalls: 1, evaluatorCalls: 1 });
      } finally {
        await sdk.runtime.stop();
      }
    },
    3_000,
  );

  it.each(["role", "context"])(
    "preserves pre-model %s refusal",
    async (gate) => {
      const f = promotedFixture();
      const child = f.actions.find(
        (action) => action.name === firstName,
      ) as Action;
      if (gate === "role") child.roleGate = { minRole: "ADMIN" };
      else child.contextGate = { anyOf: ["settings"] };
      f.parent.subActions = [child.name];
      const sdk = await sdkFixture(
        f.parent,
        f.actions,
        firstName,
        {},
        { exposure: true },
      );
      try {
        await expect(sdk.run()).rejects.toThrow("no sub-actions available");
        expect(f.operations).toHaveLength(0);
        expect(sdk.counts()).toEqual({ modelCalls: 0, evaluatorCalls: 0 });
        expect(sdk.originalTools).toHaveLength(0);
      } finally {
        await sdk.runtime.stop();
      }
    },
    3_000,
  );

  it("disabled policy preserves the exact SDK payload", async () => {
    const f = promotedFixture();
    const sdk = await sdkFixture(
      f.parent,
      f.actions,
      firstName,
      {},
      { exposure: false },
    );
    try {
      await sdk.run();
      expect(sdk.capturedTools[0]).toHaveLength(10);
      expect(sdk.capturedTools[0]).toBe(sdk.originalTools[0]);
    } finally {
      await sdk.runtime.stop();
    }
  }, 3_000);
});
