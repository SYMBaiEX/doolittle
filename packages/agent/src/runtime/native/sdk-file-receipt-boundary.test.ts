import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  type Action,
  type ActionResult,
  BUILTIN_RESPONSE_HANDLER_FIELD_EVALUATORS,
  ChannelType,
  ContextRegistry,
  DefaultMessageService,
  EventType,
  type IAgentRuntime,
  type Memory,
  ModelType,
  OPTIMIZED_PROMPT_SERVICE,
  ResponseHandlerFieldRegistry,
  type State,
  TurnControllerRegistry,
} from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFileActions } from "@/actions/file-action";
import { runWithTurnRuntimeScope } from "@/runtime/turn-runtime-scope";
import { writeWorkspaceFile } from "@/services/workspace-service/file-operations";

const messageId = "00000000-0000-4000-8000-000000000032";
const roomId = "00000000-0000-4000-8000-000000000035";
const syntheticPrompt = "Bounded public synthetic file receipt control.";
const publicContent = "public synthetic receipt\n";
const fixturePrefix = "doolittle-sdk-file-receipt-";
const ownedWorkspaces = new Set<string>();

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
  for (const workspace of ownedWorkspaces) {
    // Only exact temporary directories created by this test may be removed.
    expect(dirname(workspace)).toBe(realpathSync(tmpdir()));
    expect(basename(workspace).startsWith(fixturePrefix)).toBe(true);
    rmSync(workspace, { recursive: true, force: true });
  }
  ownedWorkspaces.clear();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

type CompletedEvent = {
  runtime: IAgentRuntime;
  messageId: string;
  roomId: string;
  world: string;
  content: {
    actions: string[];
    actionStatus: string;
    actionResult: ActionResult;
  };
};

function routerReply(actionNames: string[]) {
  return JSON.stringify({
    shouldRespond: "RESPOND",
    contexts: ["code"],
    intents: [],
    candidateActionNames: actionNames,
    replyText: "",
    facts: [],
    relationships: [],
    addressedTo: [],
    topics: [],
    emotion: "none",
  });
}

function writeReply() {
  return JSON.stringify({
    toolCalls: [
      {
        name: "WRITE_FILE",
        params: { path: "receipt.txt", content: publicContent },
      },
    ],
  });
}

const finishReply = JSON.stringify({
  success: true,
  decision: "FINISH",
  messageToUser: "Public synthetic fixture complete.",
});

// Real installed DefaultMessageService and real product WRITE_FILE handler.
// The coding service boundary delegates to the production workspace writer,
// avoiding WorkspaceService's checkpoint subprocess. All other I/O is in-memory;
// model responses are a finite array, not a provider or a copied SDK planner.
function fixture(replies: Array<string | Error>) {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), fixturePrefix)));
  chmodSync(workspace, 0o700);
  ownedWorkspaces.add(workspace);
  const writeAction = createFileActions().find(
    (action) => action.name === "WRITE_FILE",
  );
  if (!writeAction) throw new Error("Missing product WRITE_FILE.");
  const actions = [writeAction];
  const modelTypes: string[] = [];
  const optimizedTasks: string[] = [];
  const plannerTemplateSelections: boolean[] = [];
  const completed: CompletedEvent[] = [];
  const settled: ActionResult[] = [];
  const fields = new ResponseHandlerFieldRegistry();
  for (const field of BUILTIN_RESPONSE_HANDLER_FIELD_EVALUATORS)
    fields.register(field);
  const state: State = { values: {}, data: {}, text: "" };
  const noop = async () => undefined;
  const writeFile = vi.fn(async (path: string, content: string) =>
    writeWorkspaceFile(workspace, path, content),
  );
  const optimizedPromptService = {
    getPrompt(task: string) {
      optimizedTasks.push(task);
      if (task !== "should_respond" && task !== "action_planner")
        throw new Error("Unexpected fixture prompt task.");
      // A distinct prompt prevents the SDK's ambient optimized-artifact fallback.
      return { prompt: syntheticPrompt, optimizerSource: "instruction-search" };
    },
  };
  const runtime = {
    agentId: "00000000-0000-4000-8000-000000000031",
    character: { name: "Public synthetic fixture" },
    actions,
    providers: [],
    contexts: new ContextRegistry([{ id: "code" }, { id: "system" }]),
    responseHandlerFieldRegistry: fields,
    turnControllers: new TurnControllerRegistry(),
    stateCache: new Map(),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    getSetting: () => undefined,
    getService: (name: string) => {
      if (name === OPTIMIZED_PROMPT_SERVICE) return optimizedPromptService;
      if (name === "doolittle_coding_agent") return { writeFile };
      return null;
    },
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
    emitEvent: async (name: string, payload: unknown) => {
      if (name === EventType.ACTION_COMPLETED)
        completed.push(payload as CompletedEvent);
    },
    runActionsByMode: noop,
    applyPipelineHooks: noop,
    startRun: () => "00000000-0000-4000-8000-000000000034",
    useModel: async (
      modelType: string,
      params: { messages?: Array<{ content?: unknown }> },
    ) => {
      modelTypes.push(modelType);
      if (modelType === ModelType.ACTION_PLANNER)
        plannerTemplateSelections.push(
          params.messages?.some(
            ({ content }) =>
              typeof content === "string" && content.includes(syntheticPrompt),
          ) === true,
        );
      const reply = replies.shift();
      if (reply === undefined)
        throw new Error("Fixture model budget exceeded.");
      if (reply instanceof Error) throw reply;
      return reply;
    },
  } as unknown as IAgentRuntime;
  const message: Memory = {
    id: messageId,
    agentId: runtime.agentId,
    entityId: "00000000-0000-4000-8000-000000000033",
    roomId,
    content: {
      text: "Write the public synthetic fixture.",
      channelType: ChannelType.DM,
    },
  };
  function scoped<T>(task: () => T) {
    return runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), settledActionResults: settled },
      task,
    );
  }
  function run() {
    return scoped(() =>
      new DefaultMessageService().handleMessage(runtime, message, undefined, {
        useMultiStep: true,
        maxMultiStepIterations: 1,
        continueAfterActions: false,
        timeoutDuration: 2_000,
      }),
    );
  }
  return {
    runtime,
    message,
    state,
    workspace,
    writeAction,
    writeFile,
    modelTypes,
    optimizedTasks,
    plannerTemplateSelections,
    completed,
    settled,
    replies,
    scoped,
    run,
  };
}

function expectSuccessfulWrite(result: ActionResult, workspace: string) {
  expect(result.success).toBe(true);
  expect(result.data).toMatchObject({
    mutationKind: "local-file",
    mutationAction: "WRITE_FILE",
    mutation: {
      action: "WRITE_FILE",
      requestedPath: "receipt.txt",
      resolvedPath: join(workspace, "receipt.txt"),
      success: true,
      bytes: Buffer.byteLength(publicContent),
    },
    fileOperation: {
      type: "write",
      target: "receipt.txt",
      size: Buffer.byteLength(publicContent),
    },
  });
}

function expectCommittedFile(f: ReturnType<typeof fixture>) {
  expect(statSync(f.workspace).mode & 0o777).toBe(0o700);
  expect(readFileSync(join(f.workspace, "receipt.txt"), "utf8")).toBe(
    publicContent,
  );
  expect(f.writeFile).toHaveBeenCalledExactlyOnceWith(
    "receipt.txt",
    publicContent,
  );
}

describe("installed SDK product file receipt boundary", () => {
  it("preserves the real WRITE_FILE metadata in raw completion and returned state", async () => {
    const f = fixture([routerReply(["WRITE_FILE"]), writeReply(), finishReply]);
    const result = await f.run();
    expectCommittedFile(f);
    expect(result.didRespond).toBe(true);
    expect(f.completed).toHaveLength(1);
    expect(f.completed[0].runtime).toBe(f.runtime);
    expect(f.completed[0]).toMatchObject({
      messageId,
      roomId,
      world: roomId,
      content: { actions: ["WRITE_FILE"], actionStatus: "completed" },
    });
    expectSuccessfulWrite(f.completed[0].content.actionResult, f.workspace);
    expect(f.completed[0].content.actionResult.data?.actionName).toBe(
      "WRITE_FILE",
    );
    const returned = result.state?.data?.actionResults as ActionResult[];
    expect(returned).toHaveLength(1);
    expectSuccessfulWrite(returned[0], f.workspace);
    expect(returned[0].data?.actionName).toBe("WRITE_FILE");
    // The real producer's turn receipt is a separate transport, not an event
    // observer fixture or a copy reconstructed from the returned SDK state.
    expect(f.settled).toHaveLength(1);
    expectSuccessfulWrite(f.settled[0], f.workspace);
    const scopedReceiptId = f.settled[0].data?.doolittleTurnReceiptId;
    expect(scopedReceiptId).toEqual(expect.any(String));
    expect(returned[0].data?.doolittleTurnReceiptId).toBe(scopedReceiptId);
    expect(
      f.completed[0].content.actionResult.data?.doolittleTurnReceiptId,
    ).toBe(scopedReceiptId);
    expect(f.modelTypes).toEqual([
      ModelType.RESPONSE_HANDLER,
      ModelType.ACTION_PLANNER,
      ModelType.RESPONSE_HANDLER,
    ]);
    expect(f.replies).toHaveLength(0);
    expect(f.plannerTemplateSelections).toEqual([true]);
    expect(f.optimizedTasks).toEqual(["should_respond", "action_planner"]);
    expect(f.runtime.turnControllers.hasActiveTurn(roomId)).toBe(false);
  }, 5_000);

  it("retains the committed product receipt in turn scope when the later evaluator fails", async () => {
    const f = fixture([
      routerReply(["WRITE_FILE"]),
      writeReply(),
      new Error("Synthetic later evaluator failure."),
      // beta.7 tries four fixed recovery models before its generic reply.
      // Refuse each in-memory; never resolve a provider or expand the budget.
      new Error("Synthetic recovery refused."),
      new Error("Synthetic recovery refused."),
      new Error("Synthetic recovery refused."),
      new Error("Synthetic recovery refused."),
    ]);
    const result = await f.run();
    // beta.7 converts the later failure to a generic reply, not a rejected
    // handleMessage promise. That reply state does not contain the committed
    // action receipt; persistence must remain independent of this fallback.
    expect(result.didRespond).toBe(true);
    expect(result.mode).toBe("simple");
    expect(result.responseContent?.text).toBe(
      "Something went wrong on my end. Please try again.",
    );
    expect(result.state?.data?.actionResults).toBeUndefined();
    expectCommittedFile(f);
    expect(f.completed).toHaveLength(1);
    expectSuccessfulWrite(f.completed[0].content.actionResult, f.workspace);
    expect(f.modelTypes).toEqual([
      ModelType.RESPONSE_HANDLER,
      ModelType.ACTION_PLANNER,
      ModelType.RESPONSE_HANDLER,
      ModelType.TEXT_LARGE,
      ModelType.RESPONSE_HANDLER,
      ModelType.TEXT_SMALL,
      ModelType.TEXT_NANO,
    ]);
    expect(f.plannerTemplateSelections).toEqual([true]);
    expect(f.replies).toHaveLength(0);
    // Required producer persistence, independent of the unavailable SDK return.
    expect(f.settled).toHaveLength(1);
    expectSuccessfulWrite(f.settled[0], f.workspace);
    expect(f.runtime.turnControllers.hasActiveTurn(roomId)).toBe(false);
  }, 5_000);

  it("keeps committed-write success distinct from a throwing delivery callback", async () => {
    const f = fixture([]);
    let scopedBeforeDelivery = false;
    const callback = vi
      .fn()
      .mockImplementationOnce(async () => {
        // Check persistence at the real delivery boundary, not only after return.
        scopedBeforeDelivery =
          f.settled.length === 1 && f.settled[0].success === true;
        throw new Error("Synthetic delivery failure.");
      })
      .mockResolvedValue(undefined);
    // v5 planned execution does not supply this callback; exercise the actual
    // product handler directly to isolate its public delivery contract.
    const result = await f.scoped(() =>
      f.writeAction.handler(
        f.runtime,
        f.message,
        f.state,
        { parameters: { path: "receipt.txt", content: publicContent } },
        callback,
      ),
    );
    expectCommittedFile(f);
    expect(f.modelTypes).toHaveLength(0);
    expect(f.completed).toHaveLength(0);
    expect(callback).toHaveBeenCalled();
    expect(scopedBeforeDelivery).toBe(true);
    expect(f.settled).toHaveLength(1);
    expectSuccessfulWrite(f.settled[0], f.workspace);
    expectSuccessfulWrite(result as ActionResult, f.workspace);
    expect(result).toBe(f.settled[0]);
    expect((result as ActionResult).data?.callbackDelivery).toBe("failed");
    expect(callback).toHaveBeenCalledTimes(1);
  }, 5_000);

  it("retains the real inner write when a synthetic subplanner tail owns the final projection", async () => {
    const umbrellaName = "TEST_MUTATION_CHAIN";
    const tailName = "TEST_PUBLIC_TAIL";
    const f = fixture([
      routerReply([umbrellaName]),
      JSON.stringify({
        toolCalls: [{ name: umbrellaName, args: {} }],
        messageToUser: "Public synthetic fixture complete.",
        completed: true,
      }),
      JSON.stringify({
        toolCalls: [
          {
            id: "write",
            name: "WRITE_FILE",
            args: { path: "receipt.txt", content: publicContent },
          },
          { id: "tail", name: tailName, args: {} },
        ],
        messageToUser: "Public synthetic fixture complete.",
        completed: true,
      }),
      JSON.stringify({
        success: true,
        decision: "NEXT_RECOMMENDED",
        recommendedToolCallId: "tail",
      }),
    ]);
    const tailHandler = vi.fn(async () => ({
      success: true,
      text: "Public synthetic observation.",
      data: { syntheticTail: true },
    }));
    const umbrellaHandler = vi.fn(async () => {
      throw new Error("Synthetic umbrella handler must not execute.");
    });
    // Only the umbrella and tail are synthetic. Its inline write child is the
    // unmodified product action, dispatched by the installed SDK subplanner.
    const umbrella: Action = {
      name: umbrellaName,
      description: "Run the bounded public synthetic chain.",
      contexts: ["code"],
      examples: [],
      validate: async () => true,
      handler: umbrellaHandler,
      subActions: [
        f.writeAction,
        {
          name: tailName,
          description: "Observe the public synthetic boundary.",
          contexts: ["code"],
          examples: [],
          validate: async () => true,
          handler: tailHandler,
        },
      ],
    };
    f.runtime.actions = [umbrella];
    const result = await f.run();
    expectCommittedFile(f);
    expect(umbrellaHandler).not.toHaveBeenCalled();
    expect(tailHandler).toHaveBeenCalledTimes(1);
    expect(f.completed.map((event) => event.content.actions)).toEqual([
      ["WRITE_FILE"],
      [tailName],
    ]);
    expectSuccessfulWrite(f.completed[0].content.actionResult, f.workspace);
    const returned = result.state?.data?.actionResults as ActionResult[];
    expect(returned).toHaveLength(1);
    expect(returned[0].data).toMatchObject({ syntheticTail: true });
    expect(returned[0].data?.mutation).toBeUndefined();
    expect(f.settled).toHaveLength(1);
    expectSuccessfulWrite(f.settled[0], f.workspace);
    expect(f.modelTypes).toEqual([
      ModelType.RESPONSE_HANDLER,
      ModelType.ACTION_PLANNER,
      ModelType.ACTION_PLANNER,
      ModelType.RESPONSE_HANDLER,
    ]);
    expect(f.replies).toHaveLength(0);
    expect(f.plannerTemplateSelections).toEqual([true, true]);
    expect(f.optimizedTasks).toEqual([
      "should_respond",
      "action_planner",
      "action_planner",
    ]);
    expect(f.runtime.turnControllers.hasActiveTurn(roomId)).toBe(false);
  }, 5_000);
});
