import { terminalAction } from "@elizaos/agent/actions/terminal";
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
import { isUnsynthesizedToolResponse } from "@/runtime/chat-turn/tool-result-synthesis";

const exactAnswer = JSON.stringify({
  status: "ok",
  entries: ["cedar", "maple"],
  source: "synthetic-shell",
});
const shellCommand = `printf '%s\\n' '${exactAnswer}'`;
const syntheticAgentId = "00000000-0000-4000-8000-000000000022";
const explicitFormatRequest = `Run this exact command: ${shellCommand}. The output is the final answer; preserve its exact bytes and formatting.`;
const formattingOnlyConstraintRequest = `Run this exact command: ${shellCommand}. Return only its JSON output byte-for-byte; do not add prose or Markdown.`;
const conditionalFormatRequest = `Run this command: ${shellCommand}. If the output is a JSON object, make that object your final response.`;
const syntheticPrompt =
  "Bounded in-memory native SHELL output characterization.";
const syntheticRunId = "synthetic-shell-run-7f31";
const syntheticMessageId = "00000000-0000-4000-8000-000000000012";

type CapturedRun = {
  runId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
};

beforeEach(() => {
  vi.stubEnv("ELIZA_TRAJECTORY_RECORDING", "false");
  vi.stubEnv("ELIZA_INFERENCE_TIMING", "false");
  vi.stubEnv("ACTION_ROLE_POLICY", "{}");
  vi.stubEnv("ELIZA_BUILD_VARIANT", "direct");
  vi.stubEnv("ELIZA_PORT", "54321");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function createFetch(run: CapturedRun) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = String(input);
    expect(requestUrl).toBe("http://localhost:54321/api/terminal/run");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body)) as {
      command: string;
      captureOutput: boolean;
      clientId: string;
    };
    expect(body.captureOutput).toBe(true);
    expect(body.clientId).toBe("runtime-terminal-action");
    return new Response(
      JSON.stringify({ ...run, command: body.command, maxDurationMs: 30_000 }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

async function runShellAction(command: string, run: CapturedRun) {
  const fetchMock = createFetch(run);
  vi.stubGlobal("fetch", fetchMock);
  const result = await terminalAction.handler(
    { agentId: syntheticAgentId } as never,
    {
      id: "00000000-0000-4000-8000-000000000023",
      roomId: "00000000-0000-4000-8000-000000000024",
      entityId: syntheticAgentId,
      content: { text: `Run ${command}` },
    } as never,
    undefined,
    { parameters: { command } },
  );
  return { fetchMock, result };
}

async function runPlannerFixture(userRequest = explicitFormatRequest) {
  const runtime = new AgentRuntime({
    character: { name: "Synthetic shell fixture", bio: ["Synthetic only."] },
    adapter: new InMemoryDatabaseAdapter(),
    enableTrajectories: false,
    disableBasicCapabilities: true,
    logLevel: "fatal",
  });
  const fetchMock = createFetch({
    runId: syntheticRunId,
    exitCode: 0,
    stdout: `${exactAnswer}\n`,
    stderr: "",
    timedOut: false,
    truncated: false,
  });
  vi.stubGlobal("fetch", fetchMock);
  const modelTypes: string[] = [];
  const replies = [
    JSON.stringify({
      shouldRespond: "RESPOND",
      contexts: ["terminal", "code"],
      intents: [],
      candidateActionNames: ["SHELL"],
      requiresTool: true,
      replyText: "",
      facts: [],
      relationships: [],
      addressedTo: [],
      topics: [],
      emotion: "none",
    }),
    JSON.stringify({
      toolCalls: [{ name: "SHELL", params: { command: shellCommand } }],
    }),
    JSON.stringify({
      success: true,
      decision: "FINISH",
      messageToUser: exactAnswer,
    }),
  ];
  const message: Memory = {
    id: syntheticMessageId,
    agentId: runtime.agentId,
    entityId: runtime.agentId,
    roomId: "00000000-0000-4000-8000-000000000013",
    content: {
      text: userRequest,
      channelType: ChannelType.DM,
    },
  };
  const state = { values: {}, data: {}, text: "" };
  const actionResults: ActionResult[] = [];
  const action = {
    ...terminalAction,
    handler: async (...args: Parameters<NonNullable<Action["handler"]>>) => {
      const result = await terminalAction.handler(...args);
      if (result) actionResults.push(result);
      return result;
    },
  } satisfies Action;

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
    await runtime.registerPlugin({
      name: "synthetic-terminal-output-preservation",
      description:
        "Pinned public SHELL action; finite model and local fetch fixtures only.",
      actions: [action],
      models: {
        [ModelType.RESPONSE_HANDLER]: async () => {
          modelTypes.push(ModelType.RESPONSE_HANDLER);
          const reply = replies.shift();
          if (reply === undefined)
            throw new Error("Synthetic model call budget exceeded.");
          return reply;
        },
        [ModelType.ACTION_PLANNER]: async () => {
          modelTypes.push(ModelType.ACTION_PLANNER);
          const reply = replies.shift();
          if (reply === undefined)
            throw new Error("Synthetic model call budget exceeded.");
          return reply;
        },
      },
    });
    const outcome = await runV5MessageRuntimeStage1({
      runtime,
      message,
      state,
      responseId: syntheticMessageId,
      plannerLoopConfig: { maxToolCalls: 1, compactionEnabled: false },
    });

    expect(outcome.kind).toBe("planned_reply");
    if (outcome.kind !== "planned_reply")
      throw new Error(
        "Synthetic terminal fixture did not produce a planned reply.",
      );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(modelTypes).toEqual([
      ModelType.RESPONSE_HANDLER,
      ModelType.ACTION_PLANNER,
      ModelType.RESPONSE_HANDLER,
    ]);
    expect(replies).toEqual([]);
    expect(actionResults).toHaveLength(1);
    const actionResult = actionResults[0];
    expect(actionResult).toMatchObject({
      success: true,
      verifiedUserFacing: true,
      userFacingText: exactAnswer,
      data: {
        actionName: "SHELL",
        command: shellCommand,
        runId: syntheticRunId,
        exitCode: 0,
        stdout: `${exactAnswer}\n`,
        stderr: "",
        timedOut: false,
        truncated: false,
      },
    });
    expect(actionResult.text).not.toBe(exactAnswer);
    expect(actionResult.text).toContain("Shell command completed");
    const finalText = outcome.result.responseContent?.text;
    expect(finalText).toBe(exactAnswer);
    expect(JSON.parse(finalText ?? "")).toEqual(JSON.parse(exactAnswer));
    return { actionResult, finalText: finalText ?? "", message };
  } finally {
    await runtime.stop();
  }
}

describe("pinned SDK SHELL exact-output preservation", () => {
  it("allows a verbatim JSON answer to an explicit exact-format request", async () => {
    const { actionResult, finalText, message } = await runPlannerFixture();

    // This is the production boundary used by tool-result synthesis. On the
    // unmodified source the receipt's verifiedUserFacing metadata is not enough
    // to distinguish a deliberately requested exact answer from a raw echo.
    expect(
      isUnsynthesizedToolResponse(
        finalText,
        [actionResult],
        message.content.text ?? "",
      ),
    ).toBe(false);
  }, 5_000);

  it("allows a verbatim JSON answer with formatting-only negative constraints", async () => {
    const { actionResult, finalText, message } = await runPlannerFixture(
      formattingOnlyConstraintRequest,
    );
    expect(finalText).toBe(exactAnswer);
    expect(
      isUnsynthesizedToolResponse(
        finalText,
        [actionResult],
        message.content.text ?? "",
      ),
    ).toBe(false);
  }, 5_000);

  it("keeps normal synthesized prose distinct from the SDK terminal receipt", async () => {
    const { actionResult, message } = await runPlannerFixture();
    expect(
      isUnsynthesizedToolResponse(
        "The requested structured result is ready.",
        [actionResult],
        message.content.text ?? "",
      ),
    ).toBe(false);
  }, 5_000);

  it("preserves a JSON object selected by a generic conditional final-response directive", async () => {
    const { actionResult, finalText, message } = await runPlannerFixture(
      conditionalFormatRequest,
    );
    expect(finalText).toBe(exactAnswer);
    expect(
      isUnsynthesizedToolResponse(
        finalText,
        [actionResult],
        message.content.text ?? "",
      ),
    ).toBe(false);
  }, 5_000);

  it("keeps a plain pwd answer distinct from the SDK's wrapped action text", async () => {
    const { result, fetchMock } = await runShellAction("pwd", {
      runId: syntheticRunId,
      exitCode: 0,
      stdout: "/synthetic/workspace\n",
      stderr: "",
      timedOut: false,
      truncated: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      verifiedUserFacing: true,
      userFacingText: "/synthetic/workspace",
      data: { command: "pwd", stdout: "/synthetic/workspace\n" },
    });
    expect(result?.text).not.toBe(result?.userFacingText);
    expect(
      isUnsynthesizedToolResponse(
        "The working directory is /synthetic/workspace.",
        result ? [result] : [],
        "Run pwd and describe the result.",
      ),
    ).toBe(false);
  }, 5_000);

  it.each([
    {
      label: "nonzero exit",
      run: {
        runId: syntheticRunId,
        exitCode: 2,
        stdout: `${exactAnswer}\n`,
        stderr: "",
        timedOut: false,
        truncated: false,
      },
    },
    {
      label: "stderr output",
      run: {
        runId: syntheticRunId,
        exitCode: 0,
        stdout: `${exactAnswer}\n`,
        stderr: "warning from synthetic process",
        timedOut: false,
        truncated: false,
      },
    },
    {
      label: "timeout",
      run: {
        runId: syntheticRunId,
        exitCode: 0,
        stdout: `${exactAnswer}\n`,
        stderr: "",
        timedOut: true,
        truncated: false,
      },
    },
    {
      label: "truncated output",
      run: {
        runId: syntheticRunId,
        exitCode: 0,
        stdout: `${exactAnswer}\n`,
        stderr: "",
        timedOut: false,
        truncated: true,
      },
    },
  ])(
    "keeps the unverified $label receipt marked for recovery",
    async ({ run }) => {
      const { fetchMock, result } = await runShellAction(shellCommand, run);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ success: true });
      expect(result?.userFacingText).toBeUndefined();
      expect(result?.verifiedUserFacing).toBeUndefined();
      expect(result?.data).toMatchObject(run);
      expect(
        isUnsynthesizedToolResponse(
          result?.text ?? "",
          result ? [result] : [],
          explicitFormatRequest,
        ),
      ).toBe(true);
    },
    5_000,
  );

  it.each([
    {
      label: "nonzero exit",
      run: {
        runId: syntheticRunId,
        exitCode: 2,
        stdout: `${exactAnswer}\n`,
        stderr: "",
        timedOut: false,
        truncated: false,
      },
    },
    {
      label: "stderr output",
      run: {
        runId: syntheticRunId,
        exitCode: 0,
        stdout: `${exactAnswer}\n`,
        stderr: "warning from synthetic process",
        timedOut: false,
        truncated: false,
      },
    },
    {
      label: "timeout",
      run: {
        runId: syntheticRunId,
        exitCode: 0,
        stdout: `${exactAnswer}\n`,
        stderr: "",
        timedOut: true,
        truncated: false,
      },
    },
    {
      label: "truncated output",
      run: {
        runId: syntheticRunId,
        exitCode: 0,
        stdout: `${exactAnswer}\n`,
        stderr: "",
        timedOut: false,
        truncated: true,
      },
    },
  ])(
    "requires recovery instead of returning bare stdout after $label",
    async ({ run }) => {
      const { result } = await runShellAction(shellCommand, run);
      expect(result?.data?.stdout).toBe(`${exactAnswer}\n`);
      expect(result?.userFacingText).toBeUndefined();
      expect(
        isUnsynthesizedToolResponse(
          exactAnswer,
          result ? [result] : [],
          explicitFormatRequest,
        ),
      ).toBe(true);
    },
    5_000,
  );
});
