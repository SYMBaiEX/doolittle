import {
  type Action,
  type ActionResult,
  ChannelType,
  type Memory,
  runShortcutGate,
  ShortcutRegistry,
  type UUID,
} from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import {
  recordScopedTurnActionResult,
  runWithTurnRuntimeScope,
} from "@/runtime/turn-runtime-scope";
import { executeProviderMessageTurn } from "./chat-turn/provider-handler";
import { createProviderStreamState } from "./chat-turn/provider-streaming";
import { DOOLITTLE_COMMAND_ACTION } from "./command-shortcut-match";

function createContext(overrides?: {
  onHandleMessage?: (handlers: {
    memory: unknown;
    onContent: (content: unknown) => Promise<unknown>;
    onStreamChunk?: (chunk: string) => Promise<void>;
    onSettledActionResult?: (result: unknown) => void;
    maxMultiStepIterations?: number;
    continueAfterActions?: boolean;
  }) => Promise<unknown>;
  getActionResults?: () => unknown[];
  captureNotice?: (notice: string) => void;
  trajectoryLogger?: unknown;
  sdkEmitsMessageSent?: boolean;
  onUseModel?: (prompt: string) => Promise<string>;
}) {
  const emittedEvents: string[] = [];
  const notices: string[] = [];
  const trajectoryLogger = overrides?.trajectoryLogger;
  const deleteMemory = vi.fn(async () => undefined);
  const useModel = vi.fn(
    async (_modelType: unknown, params: { prompt?: unknown }) =>
      overrides?.onUseModel?.(String(params.prompt ?? "")) ??
      "Synthesized tool response.",
  );

  const context = {
    config: {},
    runtime: {
      agentId: "agent-1",
      deleteMemory,
      getSetting: () => undefined,
      useModel,
      getService: (service: string) =>
        service === "trajectories" ? trajectoryLogger : null,
      getServicesByType: (service: string) =>
        service === "trajectories" && trajectoryLogger
          ? [trajectoryLogger]
          : [],
      emitEvent: async (eventType: string) => {
        emittedEvents.push(eventType);
      },
      logger: {
        warn: () => undefined,
      },
      messageService: {
        handleMessage: async (
          _runtime: unknown,
          _memory: unknown,
          onContent: (content: unknown) => Promise<unknown>,
          options?: {
            onStreamChunk?: (chunk: string) => Promise<void>;
            onSettledActionResult?: (result: unknown) => void;
            maxMultiStepIterations?: number;
            continueAfterActions?: boolean;
          },
        ) => {
          await onContent({ text: "provider response" } as never);
          if (overrides?.sdkEmitsMessageSent) {
            emittedEvents.push("MESSAGE_SENT");
          }
          if (overrides?.onHandleMessage) {
            return overrides.onHandleMessage({
              memory: _memory,
              onContent,
              onStreamChunk: options?.onStreamChunk,
              onSettledActionResult: options?.onSettledActionResult,
              maxMultiStepIterations: options?.maxMultiStepIterations,
              continueAfterActions: options?.continueAfterActions,
            });
          }
          return {
            responseMessages: [
              {
                id: "resp-1",
                content: {
                  text: "response message",
                },
              },
            ],
          };
        },
      },
      getActionResults: overrides?.getActionResults,
    },
    services: {
      settings: {
        get: () => ({
          agent: {
            runDepth: "standard",
            maxIterations: 4,
            toolProgressMode: "compact",
          },
          model: createTurnSettings().model,
        }),
      },
    },
  } as unknown as AgentExecutionContext;

  return {
    context,
    emittedEvents,
    notices,
    deleteMemory,
    onNotice: overrides?.captureNotice
      ? async (notice: { message: string }) => {
          overrides.captureNotice?.(notice.message);
          notices.push(notice.message);
        }
      : undefined,
    useModel,
  };
}

function createTurnSettings() {
  return {
    model: {
      provider: "provider-name",
      model: "m-1",
      baseUrl: "https://provider.local",
      temperature: 0.2,
      maxTokens: 512,
    },
  };
}

describe("chat turn provider handler", () => {
  async function executeTestTurn(
    context: AgentExecutionContext,
    provider = "provider-name",
    text = "hello",
  ) {
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: (current, incoming) => ({
        kind: "append",
        emittedText: incoming,
        nextText: current + incoming,
      }),
      extractCompatTextContent: () => "",
    });
    const result = await executeProviderMessageTurn({
      context,
      memory: {
        id: "memory-failure" as UUID,
        roomId: "room-failure" as UUID,
        entityId: "entity-failure" as UUID,
        content: { text, source: "cli", channelType: ChannelType.DM },
      } as Memory,
      streamState,
      messagePolicy: { useMultiStep: true, maxIterations: 4 },
      abortSignal: undefined,
      settingsDuring: {
        ...createTurnSettings(),
        model: { ...createTurnSettings().model, provider },
      },
      connectionSource: "cli",
      roomId: "room-failure",
      buildProviderFailureMessage: (_provider, _model, error) => String(error),
    });
    return { ...result, streamState };
  }

  function frontendReceipts() {
    const workdir = "/workspace/frontend-review";
    const page: ActionResult = {
      success: true,
      text: "Updated the frontend page.",
      data: {
        actionName: "WRITE_FILE",
        mutationKind: "local-file",
        mutationAction: "WRITE_FILE",
        mutation: {
          action: "WRITE_FILE",
          success: true,
          requestedPath: "app/page.tsx",
          resolvedPath: `${workdir}/app/page.tsx`,
        },
      },
    };
    const build: ActionResult = {
      success: true,
      text: "Production build passed.",
      data: {
        actionName: "SHELL",
        command: "bun run build",
        cwd: workdir,
        exitCode: 0,
      },
    };
    const ready: ActionResult = {
      success: true,
      text: "Managed application ready.",
      data: {
        actionName: "DOOLITTLE_APP_SERVER",
        status: "ready",
        url: "http://localhost:3001/",
        session: {
          id: "frontend-review-server",
          cwd: workdir,
          command: "bun run dev",
          managed: true,
          state: "running",
        },
      },
    };
    const review = (
      modelEvidence: "rendered-pixels" | "text-only",
      success = true,
    ): ActionResult => ({
      success,
      text: success
        ? "The mobile heading overflows."
        : "Browser analysis failed.",
      data: {
        actionName: "DOOLITTLE_BROWSER_ANALYZE",
        reviewAttempted: true,
        reviewedUrl: "http://localhost:3001/",
        ...(success ? { modelEvidence } : {}),
      },
    });
    return { page, build, ready, review };
  }

  function completedDelegationReceipt(): ActionResult {
    return {
      success: true,
      text: "The delegated coding agent completed the requested frontend work.",
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        mutationKind: "local-file",
        mutationAction: "TASKS_SPAWN_AGENT",
        mutation: {
          action: "TASKS_SPAWN_AGENT",
          requestedPath: "/workspace/frontend-review",
          resolvedPath: "/workspace/frontend-review/app/page.tsx",
          success: true,
          bytes: 128,
          message: "Verified delegated file change.",
        },
        delegatedExecution: {
          sessionId: "child-incomplete-response",
          agentType: "codex",
          workdir: "/workspace/frontend-review",
          status: "completed",
          stopReason: "end_turn",
          exitCode: 0,
          summary: "Implemented the requested page and verified the build.",
          observedTools: [],
          changedFiles: [
            { path: "/workspace/frontend-review/app/page.tsx", bytes: 128 },
          ],
          verifiedLocalMutation: true,
        },
      },
    };
  }

  async function runFrontendPasses(
    passes: ActionResult[][],
    options: {
      request?: string;
      responses?: string[];
      throwAfter?: boolean;
      sdkFailureAtCall?: number;
      workspaceDir?: string;
    } = {},
  ) {
    const prompts: string[] = [];
    let calls = 0;
    const { context } = createContext({
      onHandleMessage: async ({ memory, onSettledActionResult }) => {
        prompts.push(String((memory as Memory).content.text));
        if (options.throwAfter && calls >= passes.length)
          throw new Error("Final synthesis unavailable");
        for (const receipt of passes[calls] ?? [])
          onSettledActionResult?.(receipt);
        const text = options.responses?.[calls] ?? "Implementation complete.";
        const responseContent = {
          text,
          ...(options.sdkFailureAtCall === calls
            ? { failureKind: "no_provider" }
            : {}),
        };
        calls += 1;
        return { responseContent, responseMessages: [] };
      },
    });
    if (options.workspaceDir)
      context.config.workspaceDir = options.workspaceDir;
    const result = await executeTestTurn(
      context,
      "codex",
      options.request ?? "Update the frontend heading in this workspace.",
    );
    return { result, prompts, calls };
  }

  it.each(["app/page.tsx", "styles/theme.css", "public/logo.svg"])(
    "continues from native visual mutation %s/build/readiness until browser analysis is attempted",
    async (path) => {
      const { page, build, ready, review } = frontendReceipts();
      page.data = {
        ...page.data,
        mutation: {
          ...(page.data?.mutation as object),
          requestedPath: path,
          resolvedPath: `/workspace/frontend-review/${path}`,
        },
      };
      const { result, prompts, calls } = await runFrontendPasses([
        [page, build, ready],
        [review("rendered-pixels")],
      ]);
      expect(calls).toBe(2);
      expect(prompts[1]).toContain("DOOLITTLE_BROWSER_ANALYZE");
      expect(result.runFailureMessage).toBeUndefined();
      expect(result.response).toContain("rendered viewport pixels");
      expect(result.response).toContain("does not prove");
    },
  );

  it.each([
    ["rendered-pixels", true, "used rendered viewport pixels"],
    [
      "text-only",
      true,
      "used text-only evidence; rendered layout was not verified",
    ],
    ["rendered-pixels", false, "attempted but failed or was unavailable"],
  ] as const)(
    "discloses %s review evidence with success=%s without claiming a quality pass",
    async (modality, success, disclosure) => {
      const { page, build, ready, review } = frontendReceipts();
      const { result } = await runFrontendPasses([
        [page, build, ready, review(modality, success)],
      ]);
      expect(result.runFailureMessage).toBeUndefined();
      expect(result.response).toContain(disclosure);
      expect(result.response).toContain(
        "does not prove that reported defects were corrected",
      );
    },
  );

  it.each(["mutation", "backend mutation", "build", "ready"])(
    "invalidates a prior review after a later %s receipt",
    async (kind) => {
      const { page, build, ready, review } = frontendReceipts();
      const backend = structuredClone(page);
      backend.data = {
        ...page.data,
        mutation: {
          ...(page.data?.mutation as object),
          resolvedPath: "/workspace/frontend-review/api/server.ts",
        },
      };
      const later =
        kind === "mutation"
          ? [
              structuredClone(page),
              structuredClone(build),
              structuredClone(ready),
            ]
          : kind === "backend mutation"
            ? [backend, structuredClone(build), structuredClone(ready)]
            : kind === "build"
              ? [structuredClone(build), structuredClone(ready)]
              : [structuredClone(ready)];
      const { result, prompts } = await runFrontendPasses([
        [page, build, ready, review("rendered-pixels"), ...later],
      ]);
      expect(result.runFailureMessage).toContain(
        "no browser-analysis attempt followed the latest mutation, build, and ready receipt",
      );
      expect(prompts[1]).toContain("DOOLITTLE_BROWSER_ANALYZE");
    },
  );

  it("requires a new review after corrections and retains concrete critique in the correction loop", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const critique = review("rendered-pixels");
    critique.text = `${"Capture metadata ".repeat(200)}\n<untrusted-page-critique>The mobile heading overflows.</untrusted-page-critique>`;
    const { result, prompts, calls } = await runFrontendPasses(
      [
        [page, build, ready, critique],
        [structuredClone(page), structuredClone(build), structuredClone(ready)],
        [review("text-only")],
      ],
      {
        responses: [
          "I still need to correct the mobile heading.",
          "Implementation complete.",
          "Implementation complete.",
        ],
      },
    );
    expect(calls).toBe(3);
    expect(prompts[1]).toContain("The mobile heading overflows.");
    expect(prompts[2]).toContain("DOOLITTLE_BROWSER_ANALYZE");
    expect(result.runFailureMessage).toBeUndefined();
    expect(result.response).toContain("text-only evidence");
  });

  it("continues after a pixel review when the final response admits its findings remain unfixed", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const critique = review("rendered-pixels");
    critique.text =
      "Model critique used actual captured viewport pixels.\n<untrusted-page-critique>The featured image is missing and story links target the current page.</untrusted-page-critique>";
    const admittedIncomplete =
      "The production build passed, and the app is running through the managed handoff. A visual review found several issues that still need correction. I haven’t made those fixes or rerun the build yet.";
    const corrected = structuredClone(page);
    corrected.text = "Corrected the featured image and story links.";
    const correctedReview = review("rendered-pixels");
    correctedReview.text =
      "The corrected image and story links now render as intended.";

    const { result, prompts, calls } = await runFrontendPasses(
      [
        [page, build, ready, critique],
        [
          corrected,
          structuredClone(build),
          structuredClone(ready),
          correctedReview,
        ],
      ],
      {
        responses: [
          admittedIncomplete,
          "The visual findings are corrected, rebuilt, and reviewed.",
        ],
      },
    );

    expect(calls).toBe(2);
    expect(prompts[1]).toContain("The featured image is missing");
    expect(result.runFailureMessage).toBeUndefined();
    expect(result.response).toContain("findings are corrected");
  });

  it("reports incomplete frontend work after admitted findings make no progress", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const critique = review("rendered-pixels");
    critique.text =
      "<untrusted-page-critique>The hero image is missing.</untrusted-page-critique>";
    const admittedIncomplete =
      "A visual review found issues that still need correction. I haven’t made those fixes or rerun the build yet.";

    const { result, calls } = await runFrontendPasses(
      [[page, build, ready, critique], [], []],
      {
        responses: [admittedIncomplete, admittedIncomplete, admittedIncomplete],
      },
    );

    expect(calls).toBe(3);
    expect(result.runFailureMessage).toContain(
      "still incomplete after the agent's continuation attempts",
    );
    expect(result.runFailureMessage).toContain(
      "prior response explicitly acknowledged unfinished implementation",
    );
    expect(result.response).toContain(result.runFailureMessage);
  });

  it("does not treat a forbidden-action status as unfinished implementation", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const { result, calls } = await runFrontendPasses(
      [[page, build, ready, review("rendered-pixels")]],
      {
        responses: [
          "I haven’t made any network requests, as requested, or made changes outside the selected workspace or to user files. The requested frontend changes are complete, and the build and visual review passed.",
        ],
      },
    );

    expect(calls).toBe(1);
    expect(result.runFailureMessage).toBeUndefined();
    expect(result.response).toContain(
      "requested frontend changes are complete",
    );
  });

  it("preserves an admitted incomplete response when structured no-provider recovery sees old delegation receipts", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const critique = review("rendered-pixels");
    critique.text =
      "<untrusted-page-critique>The hero image is missing.</untrusted-page-critique>";
    const admittedIncomplete =
      "A visual review found issues that still need correction. I haven’t made those fixes or rerun the build yet.";
    const secondIncomplete =
      "The hero image was updated, but other review findings still need correction. I haven’t made those fixes or rerun the build yet.";
    const partialCorrection = structuredClone(page);
    partialCorrection.text = "Updated the hero image; other findings remain.";
    partialCorrection.data = {
      ...page.data,
      mutation: {
        ...(page.data?.mutation as object),
        resolvedPath: "/workspace/frontend-review/app/hero.tsx",
      },
    };
    const delegation = completedDelegationReceipt();

    const { result, calls } = await runFrontendPasses(
      [
        [page, build, ready, critique, delegation],
        [
          partialCorrection,
          structuredClone(build),
          structuredClone(ready),
          review("rendered-pixels"),
        ],
        [],
      ],
      {
        responses: [
          admittedIncomplete,
          secondIncomplete,
          "Provider unavailable. Try again.",
        ],
        sdkFailureAtCall: 2,
      },
    );

    expect(calls).toBe(3);
    expect(result.runFailureMessage).toContain(
      "prior response explicitly acknowledged unfinished implementation",
    );
    expect(result.response).toContain(result.runFailureMessage);
    expect(result.response).not.toContain("delegated coding agent completed");
  });

  it("preserves an admitted incomplete response when thrown-provider recovery sees old delegation receipts", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const critique = review("rendered-pixels");
    critique.text =
      "<untrusted-page-critique>The hero image is missing.</untrusted-page-critique>";
    const admittedIncomplete =
      "A visual review found issues that still need correction. I haven’t made those fixes or rerun the build yet.";
    const delegation = completedDelegationReceipt();

    const { result, calls } = await runFrontendPasses(
      [[page, build, ready, critique, delegation]],
      { responses: [admittedIncomplete], throwAfter: true },
    );

    expect(calls).toBe(1);
    expect(result.runFailureMessage).toContain(
      "prior response explicitly acknowledged unfinished implementation",
    );
    expect(result.response).toContain(result.runFailureMessage);
    expect(result.response).not.toContain("delegated coding agent completed");
  });

  it("does not treat a generic later completion claim as correction evidence", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const critique = review("rendered-pixels");
    critique.text =
      "<untrusted-page-critique>The hero image is missing.</untrusted-page-critique>";
    const admittedIncomplete =
      "A visual review found issues that still need correction. I haven’t made those fixes or rerun the build yet.";
    const secondIncomplete =
      "The hero image was updated, but other review findings still need correction. I haven’t made those fixes or rerun the build yet.";
    const partialCorrection = structuredClone(page);
    partialCorrection.text = "Updated the hero image; other findings remain.";
    partialCorrection.data = {
      ...page.data,
      mutation: {
        ...(page.data?.mutation as object),
        resolvedPath: "/workspace/frontend-review/app/hero.tsx",
      },
    };

    const { result, calls } = await runFrontendPasses(
      [
        [page, build, ready, critique],
        [
          partialCorrection,
          structuredClone(build),
          structuredClone(ready),
          review("rendered-pixels"),
        ],
        [],
        [],
      ],
      {
        responses: [
          admittedIncomplete,
          secondIncomplete,
          "The visual findings are corrected and the requested changes are complete.",
          "Everything is finished.",
        ],
      },
    );

    expect(calls).toBe(4);
    expect(result.runFailureMessage).toContain(
      "prior response explicitly acknowledged unfinished implementation",
    );
  });

  it.each([
    "The page edits are complete, but I haven’t rerun the build yet.",
    "The page edits are complete, but I still need to rerun the build.",
  ])(
    "clears verification-only work after fresh build/readiness/review: %s",
    async (admission) => {
      const { page, build, ready, review } = frontendReceipts();
      const { result, calls } = await runFrontendPasses(
        [
          [page, build, ready, review("rendered-pixels")],
          [
            structuredClone(build),
            structuredClone(ready),
            review("rendered-pixels"),
          ],
        ],
        {
          responses: [
            admission,
            "The new build passed, the app is ready, and the latest pixel review passed.",
          ],
        },
      );

      expect(calls).toBe(2);
      expect(result.runFailureMessage).toBeUndefined();
      expect(result.response).toContain("new build passed");
    },
  );

  it("does not clear a verification-only admission from stale pre-admission receipts", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const { result, calls } = await runFrontendPasses(
      [[page, build, ready, review("rendered-pixels")], [], []],
      {
        responses: [
          "The page edits are complete, but I haven’t rerun the build yet.",
          "Everything is complete and ready.",
          "The work is finished.",
        ],
      },
    );

    expect(calls).toBe(3);
    expect(result.runFailureMessage).toContain(
      "prior response explicitly acknowledged unfinished implementation or verification",
    );
  });

  it.each([
    "I haven’t made those fixes yet.",
    "I still need to rerun the build and fix the hero image.",
  ])(
    "does not downgrade unresolved implementation to verification-only: %s",
    async (admission) => {
      const { page, build, ready, review } = frontendReceipts();
      const { result, calls } = await runFrontendPasses(
        [
          [page, build, ready, review("rendered-pixels")],
          [],
          [
            structuredClone(build),
            structuredClone(ready),
            review("rendered-pixels"),
          ],
          [],
          [],
        ],
        {
          responses: [
            admission,
            "I haven’t rerun the build yet.",
            "The new build and visual review passed. Everything is complete.",
            "Everything is complete.",
            "Everything is complete.",
          ],
        },
      );

      expect(calls).toBe(5);
      expect(result.runFailureMessage).toContain(
        "prior response explicitly acknowledged unfinished implementation",
      );
    },
  );

  it("allows a corrected implementation to become verification-only without accepting its old checks", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const correction = structuredClone(page);
    correction.text = "Corrected the hero image.";
    const { result, calls } = await runFrontendPasses(
      [
        [page, build, ready, review("rendered-pixels")],
        [correction],
        [
          structuredClone(build),
          structuredClone(ready),
          review("rendered-pixels"),
        ],
      ],
      {
        responses: [
          "I haven’t made those fixes yet.",
          "The hero image is corrected, but I still need to rerun the build.",
          "The new build passed and the corrected app is ready and reviewed.",
        ],
      },
    );

    expect(calls).toBe(3);
    expect(result.runFailureMessage).toBeUndefined();
  });

  it.each(["fresh", "stale", "wrong workspace"])(
    "uses only required backend build verification without forcing a server or review: %s",
    async (verification) => {
      const { page, build } = frontendReceipts();
      page.data = {
        ...page.data,
        mutation: {
          ...(page.data?.mutation as object),
          resolvedPath: "/workspace/frontend-review/src/logic.ts",
        },
      };
      const newBuild = structuredClone(build);
      if (verification === "wrong workspace")
        newBuild.data = { ...newBuild.data, cwd: "/workspace/unrelated" };
      const { result, calls } = await runFrontendPasses(
        [[page, build], verification === "stale" ? [] : [newBuild], [], []],
        {
          request:
            "Update the backend logic in this workspace and run a production build.",
          responses: [
            "The code edits are complete, but I still need to rerun the build.",
            "The build passed and the requested backend changes are complete.",
            "The backend work is complete.",
            "The backend work is complete.",
          ],
        },
      );

      if (verification === "fresh") {
        expect(calls).toBe(2);
        expect(result.runFailureMessage).toBeUndefined();
        expect(result.response).not.toContain("browser-analysis");
      } else {
        expect(result.runFailureMessage).toContain(
          "prior response explicitly acknowledged unfinished implementation or verification",
        );
      }
    },
  );

  it("uses the current post-build ready receipt after an earlier post-admission readiness observation", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const { result, calls } = await runFrontendPasses(
      [
        [page, build, ready, review("rendered-pixels")],
        [
          structuredClone(ready),
          structuredClone(build),
          structuredClone(ready),
          review("rendered-pixels"),
        ],
      ],
      {
        responses: [
          "The page edits are complete, but I haven’t rerun the build yet.",
          "The fresh build passed and the current app is ready and reviewed.",
        ],
      },
    );

    expect(calls).toBe(2);
    expect(result.runFailureMessage).toBeUndefined();
  });

  it.each(["fresh build", "only fresh review", "wrong runner"])(
    "preserves a prior independent Bun install for build-only admissions: %s",
    async (verification) => {
      const { page, build, ready, review } = frontendReceipts();
      const install: ActionResult = {
        success: true,
        text: "Bun install passed.",
        data: {
          actionName: "SHELL",
          command: "bun install",
          cwd: "/workspace/frontend-review",
          exitCode: 0,
        },
      };
      const newBuild = structuredClone(build);
      if (verification === "wrong runner")
        newBuild.data = { ...newBuild.data, command: "npm run build" };
      const freshVerification =
        verification === "only fresh review"
          ? [review("rendered-pixels")]
          : [newBuild, structuredClone(ready), review("rendered-pixels")];
      const { result, calls } = await runFrontendPasses(
        [
          [page, install, build, ready, review("rendered-pixels")],
          freshVerification,
          [],
          [],
        ],
        {
          request:
            "Update the frontend heading in this workspace. Use Bun to install dependencies, run a production build, and start the app.",
          responses: [
            "The edits are complete, but I haven’t rerun the build yet.",
            "The build passed and the current app is ready and reviewed.",
            "Everything is complete.",
            "Everything is complete.",
          ],
        },
      );

      if (verification === "fresh build") {
        expect(calls).toBe(2);
        expect(result.runFailureMessage).toBeUndefined();
        expect(
          result.actionResults.filter(
            (receipt) => receipt.data?.command === "bun install",
          ),
        ).toHaveLength(1);
      } else {
        expect(result.runFailureMessage).toContain(
          "prior response explicitly acknowledged unfinished implementation or verification",
        );
      }
    },
  );

  it("clears a review-only admission without repeating the satisfied build or installation", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const { result, calls } = await runFrontendPasses(
      [[page, build, ready], [review("rendered-pixels")]],
      {
        responses: [
          "The edits and build are complete, but I still need to run the review.",
          "The current app has now been reviewed.",
        ],
      },
    );

    expect(calls).toBe(2);
    expect(result.runFailureMessage).toBeUndefined();
  });

  it.each([true, false])(
    "retains each verification stage's admission boundary: fresh build %s",
    async (freshBuild) => {
      const { page, build, ready, review } = frontendReceipts();
      const { result, calls } = await runFrontendPasses(
        [
          [page, build, ready, review("rendered-pixels")],
          freshBuild ? [structuredClone(build), structuredClone(ready)] : [],
          [review("rendered-pixels")],
          [],
          [],
        ],
        {
          responses: [
            "The edits are complete, but I haven’t rerun the build yet.",
            "I still need to run the review.",
            "The current app is reviewed and everything is complete.",
            "Everything is complete.",
            "Everything is complete.",
          ],
        },
      );

      if (freshBuild) {
        expect(calls).toBe(3);
        expect(result.runFailureMessage).toBeUndefined();
      } else {
        expect(result.runFailureMessage).toContain(
          "prior response explicitly acknowledged unfinished implementation or verification",
        );
      }
    },
  );

  it.each(["tests", "checks", "build and tests"])(
    "does not substitute fresh build/readiness/review for admitted %s",
    async (object) => {
      const { page, build, ready, review } = frontendReceipts();
      const { result } = await runFrontendPasses(
        [
          [page, build, ready, review("rendered-pixels")],
          [
            structuredClone(build),
            structuredClone(ready),
            review("rendered-pixels"),
          ],
          [],
          [],
        ],
        {
          responses: [
            `The edits are complete, but I haven’t rerun the ${object} yet.`,
            "Everything is complete.",
          ],
        },
      );
      expect(result.runFailureMessage).toContain(
        "prior response explicitly acknowledged unfinished implementation or verification",
      );
    },
  );

  it.each([
    { object: "tests", command: "bun test" },
    { object: "tests", command: "bun run test" },
    { object: "checks", command: "bun run check" },
    { object: "checks", command: "bun run typecheck" },
    { object: "tests and checks", command: "bun test && bun run check" },
  ])(
    "clears backend $object from scoped fresh literal $command without adding a build/server/review",
    async ({ object, command }) => {
      const { page, build } = frontendReceipts();
      page.data = {
        ...page.data,
        mutation: {
          ...(page.data?.mutation as object),
          resolvedPath: "/workspace/frontend-review/src/logic.ts",
        },
      };
      const check = structuredClone(build);
      check.data = { ...check.data, command };
      const { result, calls } = await runFrontendPasses(
        [[page, structuredClone(check)], [check]],
        {
          request: "Update the backend logic in this workspace and verify it.",
          responses: [
            `The edits are complete, but I haven’t rerun the ${object} yet.`,
            "The backend changes and verification are complete.",
          ],
        },
      );
      expect(calls).toBe(2);
      expect(result.runFailureMessage).toBeUndefined();
      expect(result.response).not.toContain("browser-analysis");
    },
  );

  it.each(["lint only", "lint and typecheck", "generic check only"])(
    "requires every explicitly requested fresh check: %s",
    async (checks) => {
      const { page, build } = frontendReceipts();
      page.data = {
        ...page.data,
        mutation: {
          ...(page.data?.mutation as object),
          resolvedPath: "/workspace/frontend-review/src/logic.ts",
        },
      };
      const lint = structuredClone(build);
      lint.data = { ...lint.data, command: "bun run lint" };
      const typecheck = structuredClone(build);
      typecheck.data = { ...typecheck.data, command: "bun run typecheck" };
      const generic = structuredClone(build);
      generic.data = { ...generic.data, command: "bun run check" };
      const { result, calls } = await runFrontendPasses(
        [
          [page, structuredClone(lint), structuredClone(typecheck)],
          checks === "lint and typecheck"
            ? [lint, typecheck]
            : checks === "lint only"
              ? [lint]
              : [generic],
          [],
          [],
        ],
        {
          request:
            "Update backend logic in this workspace, then run lint and typecheck.",
          responses: [
            "I haven’t rerun the checks yet.",
            "The requested work is complete.",
          ],
        },
      );
      if (checks === "lint and typecheck") {
        expect(calls).toBe(2);
        expect(result.runFailureMessage).toBeUndefined();
      } else
        expect(result.runFailureMessage).toContain(
          "prior response explicitly acknowledged unfinished implementation or verification",
        );
    },
  );

  it.each([
    {
      instruction: "Do not run lint; run check.",
      fresh: ["check"],
      complete: true,
    },
    {
      instruction: "Don’t run `lint`; run `check`.",
      fresh: ["check"],
      complete: true,
    },
    {
      instruction: 'The reference says "run lint"; run check.',
      fresh: ["check"],
      complete: true,
    },
    {
      instruction: "The reference is `run lint`; run `bun run check`.",
      fresh: ["check"],
      complete: true,
    },
    { instruction: "run check:acceptance.", fresh: ["check"], complete: false },
    {
      instruction: "run `check:acceptance`.",
      fresh: ["check"],
      complete: false,
    },
    { instruction: "run check_acceptance.", fresh: ["check"], complete: false },
    { instruction: "run check-acceptance.", fresh: ["check"], complete: false },
    {
      instruction: "run `bun run check:acceptance`.",
      fresh: ["check"],
      complete: false,
    },
    {
      instruction: "run lint, typecheck, and validate.",
      fresh: ["lint", "typecheck"],
      complete: false,
    },
    {
      instruction: "run lint, typecheck, and validate.",
      fresh: ["lint", "typecheck", "validate"],
      complete: true,
    },
    {
      instruction: "run `lint`, `typecheck`, and `validate`.",
      fresh: ["lint", "typecheck"],
      complete: false,
    },
    {
      instruction: "run `lint`, `typecheck`, and `validate`.",
      fresh: ["lint", "typecheck", "validate"],
      complete: true,
    },
    {
      instruction: "run `bun run lint` and `bun run typecheck`.",
      fresh: ["lint", "typecheck"],
      complete: true,
    },
    { instruction: "run check --help.", fresh: ["check"], complete: false },
    { instruction: "run audit and lint.", fresh: ["lint"], complete: false },
    { instruction: "run lint and audit.", fresh: ["lint"], complete: false },
    {
      instruction: "run `bun run check --help`.",
      fresh: ["check"],
      complete: false,
    },
    { instruction: "run check -h.", fresh: ["check"], complete: false },
    { instruction: "run `check:acceptance", fresh: ["check"], complete: false },
    {
      instruction: "run lint, typecheck, and",
      fresh: ["lint", "typecheck"],
      complete: false,
    },
  ])(
    "uses bounded complete-token check clauses: $instruction ($complete)",
    async ({ instruction, fresh, complete }) => {
      const { page, build } = frontendReceipts();
      page.data = {
        ...page.data,
        mutation: {
          ...(page.data?.mutation as object),
          resolvedPath: "/workspace/frontend-review/src/logic.ts",
        },
      };
      const receipt = (script: string) => {
        const command = structuredClone(build);
        command.data = { ...command.data, command: `bun run ${script}` };
        return command;
      };
      const { result, calls } = await runFrontendPasses(
        [
          [
            page,
            receipt("check"),
            receipt("lint"),
            receipt("typecheck"),
            receipt("validate"),
          ],
          fresh.map(receipt),
          [],
          [],
        ],
        {
          request: `Update backend logic in this workspace. ${instruction}`,
          responses: [
            "I haven’t rerun the checks yet.",
            "The requested work is complete.",
          ],
        },
      );
      if (complete) {
        expect(calls).toBe(2);
        expect(result.runFailureMessage).toBeUndefined();
      } else
        expect(result.runFailureMessage).toContain(
          "prior response explicitly acknowledged unfinished implementation or verification",
        );
    },
  );

  it("does not guess the identity of unresolved plural checks from a new arbitrary check script", async () => {
    const { page, build } = frontendReceipts();
    page.data = {
      ...page.data,
      mutation: {
        ...(page.data?.mutation as object),
        resolvedPath: "/workspace/frontend-review/src/logic.ts",
      },
    };
    const check = structuredClone(build);
    check.data = { ...check.data, command: "bun run check" };
    const { result } = await runFrontendPasses([[page], [check], [], []], {
      workspaceDir: "/workspace/frontend-review",
      request: "Update backend logic in this workspace and verify it.",
      responses: [
        "I haven’t rerun the checks yet.",
        "The requested work is complete.",
      ],
    });
    expect(result.runFailureMessage).toContain(
      "prior response explicitly acknowledged unfinished implementation or verification",
    );
  });

  it("accepts the first fresh backend test in the canonical configured task workspace", async () => {
    const { page, build } = frontendReceipts();
    page.data = {
      ...page.data,
      mutation: {
        ...(page.data?.mutation as object),
        resolvedPath: "/workspace/frontend-review/src/logic.ts",
      },
    };
    const test = structuredClone(build);
    test.data = { ...test.data, command: "bun test" };
    const { result, calls } = await runFrontendPasses([[page], [test]], {
      workspaceDir: "/workspace/frontend-review",
      request: "Update the backend logic in this workspace and verify it.",
      responses: [
        "The code is complete, but I haven’t rerun the tests yet.",
        "The tests passed and all requested work is complete.",
      ],
    });
    expect(calls).toBe(2);
    expect(result.runFailureMessage).toBeUndefined();
  });

  it.each([
    "stale",
    "wrong workspace",
    "failed",
    "help",
    "arbitrary shell",
    "before mutation",
    "checks instead of tests",
  ])("refuses invalid fresh test evidence: %s", async (kind) => {
    const { page, build } = frontendReceipts();
    page.data = {
      ...page.data,
      mutation: {
        ...(page.data?.mutation as object),
        resolvedPath: "/workspace/frontend-review/src/logic.ts",
      },
    };
    const oldTest = structuredClone(build);
    oldTest.data = { ...oldTest.data, command: "bun test" };
    const test = structuredClone(oldTest);
    test.data = {
      ...test.data,
      ...(kind === "wrong workspace" ? { cwd: "/workspace/unrelated" } : {}),
      ...(kind === "failed" ? { exitCode: 1 } : {}),
      ...(kind === "help" ? { command: "bun test --help" } : {}),
      ...(kind === "arbitrary shell" ? { command: "echo tests passed" } : {}),
      ...(kind === "checks instead of tests"
        ? { command: "bun run check" }
        : {}),
    };
    if (kind === "failed") test.success = false;
    const { result } = await runFrontendPasses(
      [
        [page, oldTest],
        kind === "stale"
          ? []
          : kind === "before mutation"
            ? [test, structuredClone(page)]
            : [test],
        [],
        [],
      ],
      {
        request: "Update the backend logic in this workspace and verify it.",
        responses: [
          "The code is complete, but I haven’t rerun the tests yet.",
          "Everything is complete.",
        ],
      },
    );
    expect(result.runFailureMessage).toContain(
      "prior response explicitly acknowledged unfinished implementation or verification",
    );
  });

  it("clears frontend tests with fresh test evidence while preserving the satisfied build/readiness/review", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const test = structuredClone(build);
    test.data = { ...test.data, command: "bun test" };
    const { result, calls } = await runFrontendPasses(
      [[page, build, ready, review("rendered-pixels")], [test]],
      {
        responses: [
          "The edits are complete, but I haven’t rerun the tests yet.",
          "The tests passed and all requested work is complete.",
        ],
      },
    );
    expect(calls).toBe(2);
    expect(result.runFailureMessage).toBeUndefined();
  });

  it.each(["fresh", "stale", "no review", "wrong workspace", "stopped"])(
    "requires fresh current readiness/review without repeating Bun install/build: %s",
    async (kind) => {
      const { page, build, ready, review } = frontendReceipts();
      const install = structuredClone(build);
      install.data = { ...install.data, command: "bun install" };
      const freshReady = structuredClone(ready);
      if (kind === "wrong workspace")
        freshReady.data = {
          ...freshReady.data,
          session: {
            ...(freshReady.data?.session as object),
            cwd: "/workspace/unrelated",
          },
        };
      const stopped = structuredClone(ready);
      stopped.data = {
        ...stopped.data,
        status: "stopped",
        session: { ...(stopped.data?.session as object), state: "stopped" },
      };
      const subsequent =
        kind === "stale"
          ? [review("rendered-pixels")]
          : kind === "no review"
            ? [freshReady]
            : kind === "stopped"
              ? [freshReady, stopped, review("rendered-pixels")]
              : [freshReady, review("rendered-pixels")];
      const { result, calls } = await runFrontendPasses(
        [
          [page, install, build, ready, review("rendered-pixels")],
          subsequent,
          [],
          [],
        ],
        {
          request: "Update the frontend heading in this workspace using Bun.",
          responses: [
            "The code and build are complete, but the app is not ready yet.",
            "Everything is complete.",
          ],
        },
      );
      if (kind === "fresh") {
        expect(calls).toBe(2);
        expect(result.runFailureMessage).toBeUndefined();
      } else expect(result.runFailureMessage).toBeDefined();
    },
  );

  it.each([
    "I haven’t made any fixes outside the requested file, as instructed.",
    "I haven’t made any corrections to other files, as instructed.",
    "I haven’t fixed the issues outside the selected workspace, as instructed.",
  ])(
    "does not treat prohibited correction objects as unfinished work: %s",
    async (constraint) => {
      const { page, build, ready, review } = frontendReceipts();
      const { result, calls } = await runFrontendPasses(
        [[page, build, ready, review("rendered-pixels")]],
        { responses: [`${constraint} The requested work is complete.`] },
      );
      expect(calls).toBe(1);
      expect(result.runFailureMessage).toBeUndefined();
    },
  );

  it("retains genuine unfinished work alongside a truthful prohibited-action statement", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const { result } = await runFrontendPasses(
      [[page, build, ready, review("rendered-pixels")], [], [], []],
      {
        responses: [
          "I haven’t made any fixes outside the requested file, as instructed. I haven’t made the requested fixes yet.",
          "Everything is complete.",
        ],
      },
    );
    expect(result.runFailureMessage).toContain(
      "prior response explicitly acknowledged unfinished implementation or verification",
    );
  });

  it.each(["completion", "verification downgrade"])(
    "does not let an unrelated workspace mutation satisfy backend correction: %s",
    async (kind) => {
      const { page, build } = frontendReceipts();
      page.data = {
        ...page.data,
        mutation: {
          ...(page.data?.mutation as object),
          resolvedPath: "/workspace/target/src/logic.ts",
        },
      };
      const unrelated = structuredClone(page);
      unrelated.data = {
        ...unrelated.data,
        mutation: {
          ...(unrelated.data?.mutation as object),
          resolvedPath: "/workspace/unrelated/note.txt",
        },
      };
      const test = structuredClone(build);
      test.data = {
        ...test.data,
        command: "bun test",
        cwd: "/workspace/target/src",
      };
      const { result } = await runFrontendPasses(
        [[page], [unrelated], [test], [], []],
        {
          request: "Update the backend logic in this workspace.",
          responses: [
            "I haven’t made the requested fixes yet.",
            kind === "verification downgrade"
              ? "I haven’t rerun the tests yet."
              : "Everything is complete.",
            "Everything is complete.",
          ],
        },
      );
      expect(result.runFailureMessage).toContain(
        "prior response explicitly acknowledged unfinished implementation or verification",
      );
    },
  );

  it("accepts a backend correction inside the originally established mutation directory", async () => {
    const { page } = frontendReceipts();
    page.data = {
      ...page.data,
      mutation: {
        ...(page.data?.mutation as object),
        resolvedPath: "/workspace/target/src/logic.ts",
      },
    };
    const { result, calls } = await runFrontendPasses(
      [[page], [structuredClone(page)]],
      {
        request: "Update the backend logic in this workspace.",
        responses: [
          "I haven’t made the requested fixes yet.",
          "The requested changes are complete.",
        ],
      },
    );
    expect(calls).toBe(2);
    expect(result.runFailureMessage).toBeUndefined();
  });

  it.each([true, false])(
    "retains admitted tests through a subsequent backend implementation correction: fresh tests %s",
    async (freshTests) => {
      const { page, build } = frontendReceipts();
      page.data = {
        ...page.data,
        mutation: {
          ...(page.data?.mutation as object),
          resolvedPath: "/workspace/frontend-review/src/logic.ts",
        },
      };
      const test = structuredClone(build);
      test.data = { ...test.data, command: "bun test" };
      const { result, calls } = await runFrontendPasses(
        [
          [page, structuredClone(test)],
          [structuredClone(page), ...(freshTests ? [test] : [])],
          [],
          [],
        ],
        {
          request: "Update the backend logic in this workspace.",
          responses: [
            "I haven’t made the requested fixes yet, and I haven’t rerun the tests yet.",
            "Everything is complete.",
          ],
        },
      );
      if (freshTests) {
        expect(calls).toBe(2);
        expect(result.runFailureMessage).toBeUndefined();
      } else
        expect(result.runFailureMessage).toContain(
          "prior response explicitly acknowledged unfinished implementation or verification",
        );
    },
  );

  it.each(["not attempted", "wrong URL", "before ready"])(
    "does not accept an invalid review receipt: %s",
    async (kind) => {
      const { page, build, ready, review } = frontendReceipts();
      const invalid = review("rendered-pixels", false);
      invalid.data = {
        ...invalid.data,
        ...(kind === "not attempted" ? { reviewAttempted: false } : {}),
        ...(kind === "wrong URL"
          ? { reviewedUrl: "http://localhost:9999/" }
          : {}),
      };
      const receipts =
        kind === "before ready"
          ? [page, build, invalid, ready]
          : [page, build, ready, invalid];
      const { result } = await runFrontendPasses([receipts]);
      expect(result.runFailureMessage).toContain("no browser-analysis attempt");
    },
  );

  it("gates frontend creation even when only a non-visual file receipt is present", async () => {
    const { page, build, ready } = frontendReceipts();
    page.data = {
      ...page.data,
      mutation: {
        ...(page.data?.mutation as object),
        resolvedPath: "/workspace/frontend-review/package.json",
      },
    };
    const { result } = await runFrontendPasses([[page, build, ready]], {
      request: "Create a website in this workspace.",
    });
    expect(result.runFailureMessage).toContain("no browser-analysis attempt");
  });

  it("leaves backend-only completion unchanged", async () => {
    const { page } = frontendReceipts();
    page.data = {
      ...page.data,
      mutation: {
        ...(page.data?.mutation as object),
        resolvedPath: "/workspace/frontend-review/api/server.ts",
      },
    };
    const { result, calls } = await runFrontendPasses([[page]], {
      request: "Update the backend worker in this workspace.",
    });
    expect(calls).toBe(1);
    expect(result.runFailureMessage).toBeUndefined();
    expect(result.response).not.toContain("Browser analysis");
  });

  it.each([
    [
      "Implement a Next.js API endpoint at app/api/orders/route.ts; do not change UI or start a server.",
      false,
    ],
    [
      "Implement a React-framework API endpoint at app/api/orders/route.ts; do not change UI or start a server.",
      false,
    ],
    [
      "Create a backend-only Next.js API handler at app/api/orders/route.ts.",
      false,
    ],
    [
      "Implement a Next.js API endpoint at app/api/orders/route.ts and verify the build; do not start a server.",
      true,
    ],
  ] as const)(
    "does not activate frontend review for framework-only API work: %s",
    async (request, buildRequired) => {
      const { page, build } = frontendReceipts();
      page.data = {
        ...page.data,
        mutation: {
          ...(page.data?.mutation as object),
          requestedPath: "app/api/orders/route.ts",
          resolvedPath: "/workspace/frontend-review/app/api/orders/route.ts",
        },
      };
      const { result, calls } = await runFrontendPasses(
        [buildRequired ? [page, build] : [page]],
        { request },
      );
      expect(calls).toBe(1);
      expect(result.runFailureMessage).toBeUndefined();
      expect(result.response).not.toContain("Browser analysis");
    },
  );

  it("preserves the frontend review gate if continuation throws", async () => {
    const { page, build, ready } = frontendReceipts();
    const { result } = await runFrontendPasses([[page, build, ready]], {
      throwAfter: true,
    });
    expect(result.runFailureMessage).toContain("no browser-analysis attempt");
  });

  it.each([
    "Update the frontend heading; do not start a server.",
    "Update the frontend heading; don't restart the server.",
    "Update the frontend heading; don’t restart the server.",
  ])(
    "reports review unavailable without starting or restarting a server when visual work forbids it: %s",
    async (request) => {
      const { page, build } = frontendReceipts();
      const { result, calls } = await runFrontendPasses([[page, build]], {
        request,
      });
      expect(calls).toBe(1);
      expect(result.runFailureMessage).toContain(
        "unavailable and was not attempted",
      );
      expect(result.response).toContain(
        "your instruction forbids starting or restarting a server",
      );
      expect(result.response).toContain("No rendered pixels were reviewed");
      expect(result.response).not.toContain("Still missing:");
    },
  );

  it("allows review of an already verified ready app while preserving the original no-server constraint", async () => {
    const { page, build, ready, review } = frontendReceipts();
    const { result, prompts, calls } = await runFrontendPasses(
      [[page, build, ready], [review("rendered-pixels")]],
      {
        request: "Update the frontend heading; do not start a server.",
      },
    );
    expect(calls).toBe(2);
    expect(result.runFailureMessage).toBeUndefined();
    expect(prompts[1]).toContain(
      "Update the frontend heading; do not start a server.",
    );
    expect(prompts[1]).toContain("Do not start or restart one");
    expect(prompts[1]).not.toContain("Rebuild/restart/re-review");
  });

  it.each(["Start", "Restart"])(
    "does not suppress a later positive server request: %s",
    async (verb) => {
      const { page, build, ready, review } = frontendReceipts();
      const { result, prompts, calls } = await runFrontendPasses(
        [
          [page, build],
          [ready, review("rendered-pixels")],
        ],
        {
          request: `Create a website; don’t restart the server. ${verb} the application after the build.`,
        },
      );
      expect(calls).toBe(2);
      expect(result.runFailureMessage).toBeUndefined();
      expect(prompts[1]).not.toContain(
        "The user forbids starting or restarting a server.",
      );
    },
  );

  it.each([
    'Reference text: "do not start a server".',
    "Reference text: 'do not start a server'.",
    "Reference text: 'don't restart the server'.",
    "Reference text: ‘don’t restart the server’.",
    "Reference text: `do not start a server`.",
    "Reference text:\n```text\ndo not start a server\n```",
    "Reference text:\n~~~text\ndo not start a server\n~~~",
    "Reference text:\n> do not start a server",
  ])(
    "ignores quoted or code server constraints without changing the original request: %s",
    async (reference) => {
      const { page, build, ready, review } = frontendReceipts();
      const request = `Update the frontend heading. Start the application after the build.\n${reference}`;
      const { result, prompts, calls } = await runFrontendPasses(
        [
          [page, build],
          [ready, review("rendered-pixels")],
        ],
        { request },
      );
      expect(calls).toBe(2);
      expect(result.runFailureMessage).toBeUndefined();
      expect(prompts[0]).toBe(request);
      expect(prompts[1]).toContain(request);
      expect(prompts[1]).not.toContain(
        "The user forbids starting or restarting a server.",
      );
    },
  );

  it("does not let quoted positive restart text override an actual no-restart instruction", async () => {
    const { page, build } = frontendReceipts();
    const request =
      'Update the frontend heading; don’t restart the server. Example: "Restart the application".';
    const { result, prompts, calls } = await runFrontendPasses(
      [[page, build]],
      { request },
    );
    expect(calls).toBe(1);
    expect(prompts[0]).toBe(request);
    expect(result.runFailureMessage).toContain(
      "unavailable and was not attempted",
    );
  });

  it.each([
    '"Restart the server"',
    "`Restart the server`",
    "```text\nRestart the server\n```",
  ])(
    "preserves an actual no-restart instruction after reference text: %s",
    async (reference) => {
      const { page, build } = frontendReceipts();
      const request = `Update the frontend heading. Example:\n${reference}\nDon’t restart the server.`;
      const { result, prompts, calls } = await runFrontendPasses(
        [[page, build]],
        { request },
      );
      expect(calls).toBe(1);
      expect(prompts[0]).toBe(request);
      expect(result.runFailureMessage).toContain(
        "unavailable and was not attempted",
      );
    },
  );

  it.each([
    { failureKind: "no_provider" },
    {
      thought:
        "Handle a temporary reply failure during running the native tool message runtime.",
    },
  ])(
    "marks SDK-generated failure replies as failed even without a thrown error: %j",
    async (marker) => {
      const { context } = createContext({
        onHandleMessage: async () => ({
          responseContent: {
            text: "Provider unavailable. Try again.",
            ...marker,
          },
          responseMessages: [],
        }),
      });
      const result = await executeTestTurn(context);
      expect(result.runFailureMessage).toBe("Provider unavailable. Try again.");
      expect(result.response).toBe(result.runFailureMessage);
    },
  );

  it("does not complete a changed frontend from delegation and app-server receipts alone when SDK final synthesis fails", async () => {
    const completion = {
      success: true,
      text: "The codex coding agent finished its turn in /workspace. Build passed.",
      continueChain: true,
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        mutationKind: "local-file",
        mutationAction: "TASKS_SPAWN_AGENT",
        mutation: {
          action: "TASKS_SPAWN_AGENT",
          requestedPath: "/workspace",
          resolvedPath: "/workspace/app/page.tsx",
          success: true,
          bytes: 128,
          message: "Verified delegated file change.",
        },
        delegatedExecution: {
          sessionId: "child-provider-failure",
          agentType: "codex",
          workdir: "/workspace",
          status: "completed",
          stopReason: "end_turn",
          exitCode: 0,
          summary: "Implemented the requested page and verified the build.",
          observedTools: [],
          changedFiles: [{ path: "/workspace/app/page.tsx", bytes: 128 }],
          verifiedLocalMutation: true,
        },
      },
    };
    const { context } = createContext({
      onHandleMessage: async ({ onSettledActionResult, onStreamChunk }) => {
        recordScopedTurnActionResult(context.runtime, completion);
        onSettledActionResult?.(completion);
        const appServerReceipt = {
          success: true,
          text: "Application ready. Verified local URL: http://localhost:3001/",
          data: {
            actionName: "DOOLITTLE_APP_SERVER",
            status: "ready",
            url: "http://localhost:3001/",
            session: {
              id: "terminal-acceptance",
              cwd: "/workspace",
              command: "bun run dev",
              managed: true,
              state: "running",
            },
          },
        };
        recordScopedTurnActionResult(context.runtime, appServerReceipt);
        onSettledActionResult?.(appServerReceipt);
        await onStreamChunk?.(
          "Something went wrong while preparing the response.",
        );
        return {
          responseContent: {
            text: "Something went wrong while preparing the response.",
            failureKind: "no_provider",
          },
          responseMessages: [],
        };
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Implement the requested page and verify it.",
    );

    expect(result.handledMessage).toBe(true);
    expect(result.runFailureMessage).toContain("production build");
    expect(result.response).toBe(result.runFailureMessage);
    expect(result.response).not.toContain(
      "Something went wrong while preparing the response.",
    );
    expect(result.streamState.getResponse()).toBe(result.response);
    expect(result.streamState.getResponse()).not.toContain(
      "Something went wrong while preparing the response.",
    );
  });

  it("does not classify genuine assistant prose about a failure as a failed run", async () => {
    const { context } = createContext({
      onHandleMessage: async () => ({
        responseContent: {
          text: "Something went wrong on my end. Please try again.",
        },
        responseMessages: [],
      }),
    });
    expect((await executeTestTurn(context)).runFailureMessage).toBeUndefined();
  });

  it("fails an offline Ollama turn before the SDK can replace the error with a successful canned reply", async () => {
    const handled = vi.fn();
    const { context } = createContext({ onHandleMessage: handled });
    context.runtime.getSetting = () => "http://127.0.0.1:11434";
    context.runtime.fetch = vi.fn(async () => {
      throw new TypeError("connect failed");
    }) as typeof fetch;
    const result = await executeTestTurn(context, "ollama");
    expect(handled).not.toHaveBeenCalled();
    expect(result.runFailureMessage).toContain("ollama serve");
    expect(result.handledMessage).toBe(false);
  });

  it("keeps the explicit offline-bootstrap fixture independent of live model availability", async () => {
    const handled = vi.fn(async () => ({
      responseContent: { text: "Offline bootstrap is ready." },
      responseMessages: [],
    }));
    const { context } = createContext({ onHandleMessage: handled });
    context.config.offlineBootstrapMode = true;
    const fetch = vi.fn();
    context.runtime.fetch = fetch;
    const result = await executeTestTurn(context, "ollama");
    expect(fetch).not.toHaveBeenCalled();
    expect(handled).toHaveBeenCalledOnce();
    expect(result.response).toBe("Offline bootstrap is ready.");
    expect(result.runFailureMessage).toBeUndefined();
  });

  it.each([
    "/model use codex gpt-5.6-luna",
    "/model set provider codex",
    "/model set model gpt-5.6-luna",
    "/model set baseUrl https://example.test/v1",
    "/model set reasoningEffort medium",
  ])(
    "lets the SDK execute %s while the current Ollama route is offline",
    async (command) => {
      const { context, useModel } = createContext();
      const handler = vi.fn<Action["handler"]>(
        async (_runtime, _memory, _state, _options, callback) => {
          await callback?.({ text: "Model settings updated." });
          return {
            success: true,
            text: "Model settings updated.",
            userFacingText: "Model settings updated.",
            verifiedUserFacing: true,
          };
        },
      );
      const action = {
        name: DOOLITTLE_COMMAND_ACTION,
        description: "Update model settings",
        validate: async () => true,
        handler,
      } satisfies Action;
      const shortcutRegistry = new ShortcutRegistry();
      shortcutRegistry.register({
        id: "test-model-command",
        kind: "explicit",
        aliases: ["/model"],
        target: { kind: "action", name: DOOLITTLE_COMMAND_ACTION },
        requiresAction: DOOLITTLE_COMMAND_ACTION,
      });
      Object.assign(context.runtime, {
        actions: [action],
        shortcutRegistry,
        logger: { warn: vi.fn(), debug: vi.fn() },
      });
      const fetch = vi.fn(async () => {
        throw new TypeError("Ollama offline");
      });
      context.runtime.fetch = fetch as typeof globalThis.fetch;
      const handleMessage = vi.fn(async (runtime, memory) => {
        const gate = await runShortcutGate({
          runtime,
          message: memory,
          state: {} as never,
          responseId: "00000000-0000-4000-8000-000000000001" as UUID,
          senderRole: "OWNER",
        });
        if (gate?.kind !== "direct_reply") {
          throw new Error("The SDK did not dispatch the registered command.");
        }
        return { ...gate.result, didRespond: true };
      });
      const messageService = context.runtime.messageService;
      if (!messageService)
        throw new Error("Expected the test message service.");
      messageService.handleMessage = handleMessage;

      const result = await executeTestTurn(context, "ollama", command);

      expect(fetch).not.toHaveBeenCalled();
      expect(useModel).not.toHaveBeenCalled();
      expect(handleMessage).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]?.[1]).toMatchObject({
        content: { text: command },
      });
      expect(result.runFailureMessage).toBeUndefined();
      expect(result.handledMessage).toBe(true);
      expect(result.response).toBe("Model settings updated.");
    },
  );

  it.each(["/model", "/not-a-command", "please use codex"])(
    "does not exempt unregistered input from Ollama preflight: %s",
    async (command) => {
      const handled = vi.fn();
      const { context } = createContext({ onHandleMessage: handled });
      Object.assign(context.runtime, {
        actions: [],
        shortcutRegistry: new ShortcutRegistry(),
      });
      context.runtime.getSetting = () => "http://127.0.0.1:11434";
      context.runtime.fetch = vi.fn(async () => {
        throw new TypeError("Ollama offline");
      }) as typeof fetch;

      const result = await executeTestTurn(context, "ollama", command);

      expect(handled).not.toHaveBeenCalled();
      expect(result.handledMessage).toBe(false);
      expect(result.runFailureMessage).toContain("ollama serve");
    },
  );

  it("returns the terminal SDK response without re-emitting SDK message events", async () => {
    const { context, emittedEvents } = createContext({
      sdkEmitsMessageSent: true,
    });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: (current: string, incoming: string) => {
        return {
          kind: "append",
          emittedText: incoming,
          nextText: current + incoming,
        };
      },
      extractCompatTextContent: (content) =>
        typeof content === "object" && content !== null && "text" in content
          ? ((content as { text?: string }).text ?? "")
          : "",
    });

    const result = await executeProviderMessageTurn({
      context,
      memory: {
        id: "memory-1" as UUID,
        roomId: "room-1" as UUID,
        entityId: "entity-1" as UUID,
        content: {
          text: "provider response",
          source: "cli",
          channelType: ChannelType.DM,
        },
        metadata: { source: "cli" },
      } as Memory,
      streamState,
      messagePolicy: {
        useMultiStep: true,
        maxIterations: 3,
      },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      onNotice: undefined,
      connectionSource: "cli",
      roomId: "room-1",
      buildProviderFailureMessage: () => "fatal",
    });

    expect(result.handledMessage).toBe(true);
    expect(result.response).toBe("response message");
    expect(result.runFailureMessage).toBeUndefined();
    expect(emittedEvents).toEqual(["MESSAGE_SENT"]);
    expect(streamState.getResponse()).toBe("response message");
  });

  it("uses returned SDK action results as the sole action-result authority", async () => {
    const staleRuntimeResult = {
      success: true,
      data: { actionName: "RUNTIME_ACTION" },
    };
    const sdkResult = {
      success: true,
      data: { actionName: "SDK_ACTION" },
    };
    const getActionResults = vi.fn(() => [staleRuntimeResult]);
    const { context } = createContext({
      getActionResults,
      onHandleMessage: async () => ({
        responseContent: { text: "Terminal response." },
        responseMessages: [],
        state: { data: { actionResults: [sdkResult] } },
      }),
    });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: () => ({
        kind: "append",
        emittedText: "",
        nextText: "",
      }),
      extractCompatTextContent: () => "",
    });

    const result = await executeProviderMessageTurn({
      context,
      memory: {
        id: "memory-sdk-results" as UUID,
        roomId: "room-sdk-results" as UUID,
        entityId: "entity-sdk-results" as UUID,
        content: {
          text: "run action",
          source: "cli",
          channelType: ChannelType.DM,
        },
      } as Memory,
      streamState,
      messagePolicy: { useMultiStep: true, maxIterations: 3 },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      connectionSource: "cli",
      roomId: "room-sdk-results",
      buildProviderFailureMessage: () => "fatal",
    });

    expect(result.actionResults).toEqual([sdkResult]);
    expect(getActionResults).not.toHaveBeenCalled();
  });

  it("treats parsed stream tool results as non-authoritative assistant output", async () => {
    const sdkResult = {
      success: true,
      data: { actionName: "SDK_ACTION" },
    };
    const { context } = createContext({
      onHandleMessage: async ({ onStreamChunk }) => {
        await onStreamChunk?.(
          '{"type":"tool_result","toolCall":{"name":"STREAM_ACTION"},"result":{"success":true}}',
        );
        return {
          responseContent: { text: "Terminal response." },
          responseMessages: [],
          state: { data: { actionResults: [sdkResult] } },
        };
      },
    });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: () => ({
        kind: "append",
        emittedText: "",
        nextText: "",
      }),
      extractCompatTextContent: () => "",
    });

    const result = await executeProviderMessageTurn({
      context,
      memory: {
        id: "memory-stream-results" as UUID,
        roomId: "room-stream-results" as UUID,
        entityId: "entity-stream-results" as UUID,
        content: {
          text: "run action",
          source: "cli",
          channelType: ChannelType.DM,
        },
      } as Memory,
      streamState,
      messagePolicy: { useMultiStep: true, maxIterations: 3 },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      connectionSource: "cli",
      roomId: "room-stream-results",
      buildProviderFailureMessage: () => "fatal",
    });

    expect(result.actionResults).toEqual([sdkResult]);
    expect(streamState.getResponse()).toBe("Terminal response.");
  });

  it("synthesizes a raw file action receipt instead of persisting it", async () => {
    const rawRead = [
      "Read: /workspace/src/app.ts",
      "Lines: 1-3 of 3",
      "1|export function app() {",
      '2|  return "ready";',
      "3|}",
    ].join("\n");
    const sdkResult = {
      success: true,
      text: rawRead,
      userFacingText: rawRead,
      verifiedUserFacing: true,
    };
    const { context, deleteMemory, useModel } = createContext({
      onHandleMessage: async () => ({
        responseContent: { text: rawRead },
        responseMessages: [
          {
            id: "raw-response-memory" as UUID,
            content: { text: rawRead },
          },
        ],
        state: { data: { actionResults: [sdkResult] } },
      }),
      onUseModel: async (prompt) => {
        expect(prompt).toContain(
          "<user_request>Explore the workspace</user_request>",
        );
        expect(prompt).toContain("Read: /workspace/src/app.ts");
        return "This workspace contains a small TypeScript application.";
      },
    });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: () => ({
        kind: "append",
        emittedText: "",
        nextText: "",
      }),
      extractCompatTextContent: () => "",
    });

    const result = await executeProviderMessageTurn({
      context,
      memory: {
        id: "memory-raw-read" as UUID,
        roomId: "room-raw-read" as UUID,
        entityId: "entity-raw-read" as UUID,
        content: {
          text: "Explore the workspace",
          source: "desktop",
          channelType: ChannelType.DM,
        },
      } as Memory,
      streamState,
      messagePolicy: { useMultiStep: true, maxIterations: 4 },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      connectionSource: "desktop",
      roomId: "room-raw-read",
      buildProviderFailureMessage: () => "fatal",
    });

    expect(useModel).toHaveBeenCalledTimes(1);
    expect(deleteMemory).toHaveBeenCalledWith("raw-response-memory");
    expect(result.response).toBe(
      "This workspace contains a small TypeScript application.",
    );
    expect(result.responseMessages).toEqual([]);
    expect(streamState.getResponse()).toBe(result.response);
  });

  it("continues an explicit file task once after a silent exploratory terminal without duplicating the user memory", async () => {
    const memoryIds: unknown[] = [];
    const memoryTexts: string[] = [];
    const inspection = {
      success: true,
      text: "The requested folder is not present yet.",
      userFacingText: "The requested folder is not present yet.",
      verifiedUserFacing: true,
      data: { actionName: "DOOLITTLE_WORKSPACE" },
    };
    const writeReceipt = {
      success: true,
      text: "Wrote api/worker.ts",
      data: {
        actionName: "WRITE_FILE",
        mutationAction: "WRITE_FILE",
        mutationKind: "local-file",
        mutation: {
          action: "WRITE_FILE",
          success: true,
          requestedPath: "api/worker.ts",
        },
      },
    };
    const { context } = createContext({
      onHandleMessage: async ({ memory, onSettledActionResult }) => {
        const current = memory as Memory;
        memoryIds.push(current.id);
        memoryTexts.push(String(current.content.text));
        if (memoryIds.length === 1) {
          onSettledActionResult?.(inspection);
          return {
            responseContent: null,
            responseMessages: [],
            state: { data: { actionResults: [inspection] } },
          };
        }
        onSettledActionResult?.(writeReceipt);
        return {
          responseContent: { text: "The page is implemented and verified." },
          responseMessages: [],
          state: { data: { actionResults: [writeReceipt] } },
        };
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Create a backend worker in the requested workspace and verify it.",
    );

    expect(memoryIds).toEqual(["memory-failure", "memory-failure"]);
    expect(memoryTexts[0]).toBe(
      "Create a backend worker in the requested workspace and verify it.",
    );
    expect(memoryTexts[1]).toContain(
      "Continue the same requested workspace task",
    );
    expect(memoryTexts[1]).toContain("DOOLITTLE_WORKSPACE");
    expect(result).toMatchObject({
      handledMessage: true,
      response: "The page is implemented and verified.",
      runFailureMessage: undefined,
      actionResults: [inspection, writeReceipt],
    });
  });

  it("does not mistake an exploratory planner reply for completion of a file task", async () => {
    const calls: Memory[] = [];
    const inspection = {
      success: true,
      text: "The requested folder is missing; I will create the app there next.",
      data: { actionName: "SHELL" },
    };
    const writeReceipt = {
      success: true,
      text: "Created src/api/worker.ts",
      data: {
        actionName: "WRITE_FILE",
        mutationAction: "WRITE_FILE",
        mutationKind: "local-file",
        mutation: {
          action: "WRITE_FILE",
          success: true,
          requestedPath: "src/api/worker.ts",
          resolvedPath: "/workspace/src/api/worker.ts",
        },
      },
    };
    const { context } = createContext({
      onHandleMessage: async ({ memory }) => {
        calls.push(memory as Memory);
        if (calls.length === 1) {
          return {
            responseContent: {
              text: "I inspected the folder and am continuing.",
            },
            responseMessages: [],
            state: { data: { actionResults: [inspection] } },
          };
        }
        return {
          responseContent: {
            text: "The blog app is implemented and verified.",
          },
          responseMessages: [],
          state: { data: { actionResults: [writeReceipt] } },
        };
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Create the requested backend worker in the workspace and verify it.",
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.id).toBe(calls[1]?.id);
    expect(String(calls[1]?.content.text)).toContain(
      "Continue the same requested workspace task",
    );
    expect(result).toMatchObject({
      response: "The blog app is implemented and verified.",
      runFailureMessage: undefined,
      actionResults: [inspection, writeReceipt],
    });
  });

  it("uses Doolittle's scoped mutation receipt when the SDK projects it away", async () => {
    const sdkProjection = {
      success: true,
      text: "Coding agent finished.",
      data: { actionName: "TASKS_SPAWN_AGENT" },
    };
    const completion = {
      success: true,
      text: "The codex coding agent finished its turn in /workspace. One file change was verified.",
      continueChain: true,
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        mutationKind: "local-file",
        mutationAction: "TASKS_SPAWN_AGENT",
        mutation: {
          action: "TASKS_SPAWN_AGENT",
          requestedPath: "/workspace",
          resolvedPath: "/workspace/package.json",
          success: true,
          bytes: 64,
        },
        delegatedExecution: {
          sessionId: "child-scoped-receipt",
          agentType: "codex",
          workdir: "/workspace",
          status: "completed",
          stopReason: "end_turn",
          exitCode: 0,
          summary: "Implemented the requested app and verified its build.",
          observedTools: [],
          changedFiles: [],
          verifiedLocalMutation: true,
        },
      },
    };
    let context: AgentExecutionContext;
    ({ context } = createContext({
      onHandleMessage: async () => {
        recordScopedTurnActionResult(context.runtime, completion);
        return {
          responseContent: { text: "The app is implemented and verified." },
          responseMessages: [],
          actionResults: [sdkProjection],
        };
      },
    }));

    const result = await runWithTurnRuntimeScope(
      context.runtime,
      { settings: new Map(), settledActionResults: [] },
      () =>
        executeTestTurn(
          context,
          "codex",
          "Create and verify a blog app in this workspace.",
        ),
    );

    expect(result).toMatchObject({
      response: "The app is implemented and verified.",
      runFailureMessage: undefined,
      actionResults: [completion],
    });
  });

  it("restores a scoped no-op delegation receipt before parent verification", async () => {
    const workdir = "/workspace/blog";
    const sdkProjection = {
      success: true,
      text: "The existing app already satisfies the request.",
      data: { actionName: "TASKS_SPAWN_AGENT" },
    };
    const completion = {
      success: true,
      text: "The existing implementation already satisfies the requested blog app; no changes were needed.",
      continueChain: true,
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        delegatedExecution: {
          sessionId: "child-noop-receipt",
          agentType: "codex",
          workdir,
          status: "completed",
          stopReason: "end_turn",
          exitCode: 0,
          summary:
            "The existing implementation already satisfies the requested one-page Next.js blog with shadcn. No changes were needed.",
          observedTools: ["READ_FILE"],
          changedFiles: [],
          verifiedLocalMutation: false,
        },
      },
    };
    const install = {
      success: true,
      text: "Bun install passed.",
      data: {
        actionName: "SHELL",
        command: `cd "${workdir}" && bun install`,
        exitCode: 0,
      },
    };
    const build = {
      success: true,
      text: "Production build passed.",
      data: {
        actionName: "SHELL",
        command: `cd "${workdir}" && bun run build`,
        exitCode: 0,
      },
    };
    const appServer = {
      success: true,
      text: "Application is ready.",
      data: {
        actionName: "DOOLITTLE_APP_SERVER",
        status: "ready",
        url: "http://localhost:3001/",
        session: {
          id: "managed-blog-noop",
          cwd: workdir,
          command: "bun run dev",
          managed: true,
          state: "running",
        },
      },
    };
    let context: AgentExecutionContext;
    let callCount = 0;
    ({ context } = createContext({
      onHandleMessage: async () => {
        callCount += 1;
        recordScopedTurnActionResult(context.runtime, completion);
        return {
          responseContent: {
            text: "The existing blog app is verified and running.",
          },
          responseMessages: [],
          actionResults: [sdkProjection, install, build, appServer],
        };
      },
    }));

    const result = await runWithTurnRuntimeScope(
      context.runtime,
      { settings: new Map(), settledActionResults: [] },
      () =>
        executeTestTurn(
          context,
          "codex",
          "Create a one-page Next.js blog with shadcn in this workspace, install with Bun, run a production build, and start the application.",
        ),
    );

    expect(callCount).toBe(1);
    expect(result).toMatchObject({
      runFailureMessage: undefined,
      actionResults: [completion, install, build, appServer],
    });
    expect(result.response).toContain("No workspace edits were needed");
    expect(result.response).toContain("http://localhost:3001/");
  });

  it("yields after each coding action and stops as soon as no-op evidence is complete", async () => {
    const workdir = "/workspace/blog";
    const sdkProjection = {
      success: true,
      text: "The existing app already satisfies the request.",
      data: { actionName: "TASKS_SPAWN_AGENT" },
    };
    const completion = {
      success: true,
      text: "The existing implementation already satisfies the requested blog app; no changes were needed.",
      continueChain: true,
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        delegatedExecution: {
          sessionId: "child-yielded-noop",
          agentType: "codex",
          workdir,
          status: "completed",
          stopReason: "end_turn",
          exitCode: 0,
          summary:
            "The existing implementation already satisfies the requested one-page Next.js blog with shadcn. No changes were needed.",
          observedTools: ["READ_FILE"],
          changedFiles: [],
          verifiedLocalMutation: false,
        },
      },
    };
    const install = {
      success: true,
      text: "Bun install passed.",
      data: {
        actionName: "SHELL",
        command: `cd "${workdir}" && bun install`,
        exitCode: 0,
      },
    };
    const build = {
      success: true,
      text: "Production build passed.",
      data: {
        actionName: "SHELL",
        command: `cd "${workdir}" && bun run build`,
        exitCode: 0,
      },
    };
    const appServer = {
      success: true,
      text: "Application is ready.",
      data: {
        actionName: "DOOLITTLE_APP_SERVER",
        status: "ready",
        url: "http://localhost:3001/",
        session: {
          id: "managed-yielded-noop",
          cwd: workdir,
          command: "bun run dev",
          managed: true,
          state: "running",
        },
      },
    };
    const sequentialResults = [
      [sdkProjection],
      [install],
      [build],
      [appServer],
    ];
    let context: AgentExecutionContext;
    let callCount = 0;
    const plannerLimits: number[] = [];
    const continuationFlags: boolean[] = [];
    ({ context } = createContext({
      onHandleMessage: async ({
        maxMultiStepIterations,
        continueAfterActions,
      }) => {
        plannerLimits.push(maxMultiStepIterations ?? -1);
        continuationFlags.push(Boolean(continueAfterActions));
        const results = sequentialResults[callCount];
        callCount += 1;
        if (callCount === 1) {
          recordScopedTurnActionResult(context.runtime, completion);
        }
        return {
          responseContent: {
            text:
              callCount === sequentialResults.length
                ? "The app has not yet been started; I will check the workspace again."
                : "Continuing the requested workspace verification.",
          },
          responseMessages: [],
          actionResults: results,
        };
      },
    }));

    const result = await runWithTurnRuntimeScope(
      context.runtime,
      { settings: new Map(), settledActionResults: [] },
      () =>
        executeTestTurn(
          context,
          "codex",
          "Create a one-page Next.js blog with shadcn in this workspace, install with Bun, run a production build, and start the application.",
        ),
    );

    expect(plannerLimits).toEqual([1, 1, 1, 1]);
    expect(continuationFlags).toEqual([false, false, false, false]);
    expect(callCount).toBe(4);
    expect(result.runFailureMessage).toBeUndefined();
    expect(result.actionResults).toEqual(
      expect.arrayContaining([completion, install, build, appServer]),
    );
    expect(result.response).toContain("No workspace edits were needed");
    expect(result.response).toContain("http://localhost:3001/");
    expect(result.response).not.toContain("not yet been started");
  });

  it.each(["bun run dev", "bun run start"])(
    "continues a changed coding task after a premature done response until install, build, and %s readiness are verified",
    async (command) => {
      const workdir = "/workspace/blog";
      const delegate: ActionResult = {
        success: true,
        text: "Implemented the requested blog app.",
        continueChain: true,
        data: {
          actionName: "TASKS_SPAWN_AGENT",
          delegatedExecution: {
            sessionId: "child-changed-app",
            agentType: "codex",
            workdir,
            status: "completed",
            stopReason: "end_turn",
            exitCode: 0,
            summary: "Implemented the requested one-page blog.",
            changedFiles: [{ path: "app/page.tsx", bytes: 320 }],
            verifiedLocalMutation: true,
          },
        },
      };
      const install: ActionResult = {
        success: true,
        text: "Bun install passed.",
        data: {
          actionName: "SHELL",
          command: `cd "${workdir}" && bun install --frozen-lockfile`,
          exitCode: 0,
        },
      };
      const build: ActionResult = {
        success: true,
        text: "Production build passed.",
        data: {
          actionName: "SHELL",
          command: `cd "${workdir}" && bun run build`,
          exitCode: 0,
        },
      };
      const appServer: ActionResult = {
        success: true,
        text: "Application is ready at http://localhost:3001/.",
        data: {
          actionName: "DOOLITTLE_APP_SERVER",
          status: "ready",
          url: "http://localhost:3001/",
          session: {
            id: "managed-changed-app",
            cwd: workdir,
            command,
            managed: true,
            state: "running",
          },
        },
      };
      const browserReview: ActionResult = {
        success: true,
        text: "Model critique used actual captured viewport pixels. The mobile heading overflows.",
        data: {
          actionName: "DOOLITTLE_BROWSER_ANALYZE",
          reviewAttempted: true,
          reviewedUrl: "http://localhost:3001/",
          modelEvidence: "rendered-pixels",
        },
      };
      const passResults = [
        [delegate],
        [install, build, appServer],
        [browserReview],
      ];
      let context: AgentExecutionContext;
      let callCount = 0;
      ({ context } = createContext({
        onHandleMessage: async () => {
          const actionResults = passResults[callCount] ?? [];
          callCount += 1;
          return {
            responseContent: {
              text:
                callCount === 1
                  ? "Done — the blog app is implemented and ready."
                  : "Bun install and production build passed; the app is running at http://localhost:3001/.",
            },
            responseMessages: [],
            actionResults,
          };
        },
      }));

      const result = await runWithTurnRuntimeScope(
        context.runtime,
        { settings: new Map(), settledActionResults: [] },
        () =>
          executeTestTurn(
            context,
            "codex",
            "Create a one-page Next.js blog with shadcn in this workspace, use Bun, run a production build, and start the application.",
          ),
      );

      expect(callCount).toBe(3);
      expect(result.runFailureMessage).toBeUndefined();
      expect(result.actionResults).toEqual(
        expect.arrayContaining([
          delegate,
          install,
          build,
          appServer,
          browserReview,
        ]),
      );
      expect(result.response).toContain(
        "Bun install and production build passed",
      );
      expect(result.response).toContain("http://localhost:3001/");
      expect(result.response).toContain(
        "Browser analysis used rendered viewport pixels",
      );
      expect(result.response).toContain("does not prove");
    },
  );

  it("does not claim changed workspace work is complete when requested operations never produce receipts", async () => {
    const workdir = "/workspace/blog";
    const delegate: ActionResult = {
      success: true,
      text: "Implemented the requested blog app.",
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        delegatedExecution: {
          sessionId: "child-unverified-app",
          agentType: "codex",
          workdir,
          status: "completed",
          stopReason: "end_turn",
          exitCode: 0,
          summary: "Implemented the requested one-page blog.",
          changedFiles: [{ path: "app/page.tsx", bytes: 320 }],
          verifiedLocalMutation: true,
        },
      },
    };
    let callCount = 0;
    const { context } = createContext({
      onHandleMessage: async () => {
        callCount += 1;
        return {
          responseContent: {
            text: "Done — the blog app is implemented and ready.",
          },
          responseMessages: [],
          actionResults: [delegate],
        };
      },
    });

    const result = await runWithTurnRuntimeScope(
      context.runtime,
      { settings: new Map(), settledActionResults: [] },
      () =>
        executeTestTurn(
          context,
          "codex",
          "Create a one-page Next.js blog with shadcn in this workspace, use Bun, run a production build, and start the application.",
        ),
    );

    expect(callCount).toBe(12);
    expect(result.runFailureMessage).toContain(
      "implementation changed files, but the requested workspace task is not verified complete",
    );
    expect(result.runFailureMessage).toContain("successful Bun install");
    expect(result.runFailureMessage).toContain("production build");
    expect(result.runFailureMessage).toContain("ready managed app server");
    expect(result.response).toBe(result.runFailureMessage);
  });

  it("reports a clear incomplete-work failure when the continuation still has no file receipt", async () => {
    let callCount = 0;
    const inspection = {
      success: true,
      text: "The target folder is not present.",
      data: { actionName: "SHELL" },
    };
    const { context } = createContext({
      onHandleMessage: async () => {
        callCount += 1;
        return {
          responseContent: { text: "The target is ready." },
          responseMessages: [],
          state: { data: { actionResults: [inspection] } },
        };
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Create the requested app in this workspace.",
    );

    expect(callCount).toBe(12);
    expect(result.runFailureMessage).toContain(
      "No verified file changes were recorded",
    );
    expect(result.runFailureMessage).toContain("SHELL");
    expect(result.response).toBe(result.runFailureMessage);
  });

  it("fails fast after two consecutive mutation passes return no action receipts", async () => {
    let callCount = 0;
    const { context } = createContext({
      onHandleMessage: async () => {
        callCount += 1;
        return {
          responseContent: { text: "I will inspect and update the workspace." },
          responseMessages: [],
          state: { data: { actionResults: [] } },
        };
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Create a README file in this workspace.",
    );

    expect(callCount).toBe(2);
    expect(result.runFailureMessage).toContain(
      "No verified file changes were recorded",
    );
    expect(result.response).toBe(result.runFailureMessage);
  });

  it("allows a mutation action after one actionless planning pass", async () => {
    let callCount = 0;
    const writeReceipt: ActionResult = {
      success: true,
      text: "Created README.md",
      data: {
        actionName: "WRITE_FILE",
        mutationAction: "WRITE_FILE",
        mutationKind: "local-file",
        mutation: {
          action: "WRITE_FILE",
          success: true,
          requestedPath: "README.md",
          resolvedPath: "/workspace/README.md",
        },
      },
    };
    const { context } = createContext({
      onHandleMessage: async () => {
        callCount += 1;
        return callCount === 1
          ? {
              responseContent: { text: "I will inspect the workspace first." },
              responseMessages: [],
              state: { data: { actionResults: [] } },
            }
          : {
              responseContent: { text: "Created README.md." },
              responseMessages: [],
              state: { data: { actionResults: [writeReceipt] } },
            };
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Create a README file in this workspace.",
    );

    expect(callCount).toBe(2);
    expect(result.runFailureMessage).toBeUndefined();
    expect(result.actionResults).toContain(writeReceipt);
    expect(result.response).toBe("Created README.md.");
  });

  it("finishes a verified already-satisfied coding task without repeating delegation or requiring a model final", async () => {
    let callCount = 0;
    const workdir = "/workspace/blog";
    const results = [
      {
        success: true,
        text: "The existing implementation already satisfies the request; no changes were needed.",
        data: {
          actionName: "TASKS_SPAWN_AGENT",
          delegatedExecution: {
            status: "completed",
            stopReason: "end_turn",
            exitCode: 0,
            workdir,
            summary:
              "The existing implementation already satisfies the requested blog app requirements. No changes were needed.",
            changedFiles: [],
            verifiedLocalMutation: false,
          },
        },
      },
      {
        success: true,
        text: "Bun install and production build passed.",
        data: {
          actionName: "SHELL",
          command: `cd ${workdir} && bun install --frozen-lockfile && bun run build`,
          exitCode: 0,
          cwd: "/workspace",
        },
      },
      {
        success: true,
        text: "Managed server ready.",
        data: {
          actionName: "DOOLITTLE_APP_SERVER",
          status: "ready",
          url: "http://localhost:3001/",
          session: {
            id: "server-1",
            cwd: workdir,
            command: "bun run dev",
            managed: true,
            state: "running",
          },
        },
      },
      {
        success: true,
        text: "HTTP 200",
        data: {
          actionName: "SHELL",
          command: "curl -fsS http://localhost:3001/",
          exitCode: 0,
          cwd: workdir,
        },
      },
    ] as ActionResult[];
    const { context } = createContext({
      onHandleMessage: async () => {
        callCount += 1;
        return {
          // Some Eliza SDK paths complete tool work without generating a
          // terminal model response. Verified receipts must still terminate
          // the continuation loop and produce Doolittle's receipt-backed final.
          responseContent: null,
          responseMessages: [],
          actionResults: results,
        };
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Create a Next.js blog app in this workspace, use Bun, build it, and start it.",
    );

    expect(callCount).toBe(1);
    expect(result.runFailureMessage).toBeUndefined();
    expect(result.response).toContain("No workspace edits were needed");
    expect(result.response).toContain("Bun dependency installation");
    expect(result.response).toContain("http://localhost:3001/");
    expect(result.response).toContain("sessionId=server-1");
  });

  it("recovers no-op completion from the full scoped receipts when a later SDK pass throws", async () => {
    const workdir = "/workspace/blog";
    const completion: ActionResult = {
      success: true,
      text: "The existing implementation already satisfies the requested blog app; no changes were needed.",
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        delegatedExecution: {
          sessionId: "child-recovery-noop",
          agentType: "codex",
          workdir,
          status: "completed",
          stopReason: "end_turn",
          exitCode: 0,
          summary:
            "The existing implementation already satisfies the requested one-page Next.js blog with shadcn. No changes were needed.",
          changedFiles: [],
          verifiedLocalMutation: false,
        },
      },
    };
    const install: ActionResult = {
      success: true,
      text: "Bun install passed.",
      data: {
        actionName: "SHELL",
        command: `cd "${workdir}" && bun install`,
        exitCode: 0,
        runId: "install-recovery-noop",
      },
    };
    const build: ActionResult = {
      success: true,
      text: "Production build passed.",
      data: {
        actionName: "SHELL",
        command: `cd "${workdir}" && bun run build`,
        exitCode: 0,
        runId: "build-recovery-noop",
      },
    };
    const appServer: ActionResult = {
      success: true,
      text: "Application is ready.",
      data: {
        actionName: "DOOLITTLE_APP_SERVER",
        status: "ready",
        url: "http://localhost:3001/",
        session: {
          id: "server-recovery-noop",
          cwd: workdir,
          command: "bun run dev",
          managed: true,
          state: "running",
        },
      },
    };
    let context: AgentExecutionContext;
    let callCount = 0;
    ({ context } = createContext({
      onHandleMessage: async ({ onSettledActionResult }) => {
        callCount += 1;
        if (callCount === 1) {
          recordScopedTurnActionResult(context.runtime, completion);
          onSettledActionResult?.(completion);
          return {
            responseContent: { text: "Continuing verification." },
            responseMessages: [],
            actionResults: [
              {
                success: true,
                text: "The existing app satisfies the request.",
                data: { actionName: "TASKS_SPAWN_AGENT" },
              },
            ],
          };
        }

        recordScopedTurnActionResult(context.runtime, install);
        recordScopedTurnActionResult(context.runtime, build);
        recordScopedTurnActionResult(context.runtime, appServer);
        throw new Error("provider disconnected before final synthesis");
      },
    }));

    const result = await runWithTurnRuntimeScope(
      context.runtime,
      { settings: new Map(), settledActionResults: [] },
      () =>
        executeTestTurn(
          context,
          "codex",
          "Create a one-page Next.js blog with shadcn in this workspace, install with Bun, run a production build, and start the application.",
        ),
    );

    expect(callCount).toBe(2);
    expect(result.runFailureMessage).toBeUndefined();
    expect(result.actionResults).toEqual([
      completion,
      install,
      build,
      appServer,
    ]);
    expect(result.response).toContain("No workspace edits were needed");
    expect(result.response).toContain("http://localhost:3001/");
    expect(result.response).toContain(
      "model did not provide a separate final message",
    );
  });

  it("continues after a verified partial write when the response says work remains", async () => {
    const calls: Memory[] = [];
    const manifestReceipt = {
      success: true,
      text: "Created package.json",
      data: {
        actionName: "WRITE_FILE",
        mutationAction: "WRITE_FILE",
        mutationKind: "local-file",
        mutation: {
          action: "WRITE_FILE",
          success: true,
          requestedPath: "package.json",
          resolvedPath: "/workspace/package.json",
        },
      },
    };
    const pageReceipt = {
      success: true,
      text: "Created src/api/worker.ts",
      data: {
        actionName: "WRITE_FILE",
        mutationAction: "WRITE_FILE",
        mutationKind: "local-file",
        mutation: {
          action: "WRITE_FILE",
          success: true,
          requestedPath: "src/api/worker.ts",
          resolvedPath: "/workspace/src/api/worker.ts",
        },
      },
    };
    const { context } = createContext({
      onHandleMessage: async ({ memory }) => {
        calls.push(memory as Memory);
        if (calls.length === 1) {
          return {
            responseContent: {
              text: "The app is not implemented or verified yet; the build and browser check remain to be done.",
            },
            responseMessages: [],
            state: { data: { actionResults: [manifestReceipt] } },
          };
        }
        return {
          responseContent: {
            text: "The app is implemented and verified.",
          },
          responseMessages: [],
          state: { data: { actionResults: [pageReceipt] } },
        };
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Create and verify the requested backend worker in this workspace.",
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.id).toBe(calls[1]?.id);
    expect(String(calls[1]?.content.text)).toContain(
      "<previous_terminal_response>",
    );
    expect(result).toMatchObject({
      response: "The app is implemented and verified.",
      runFailureMessage: undefined,
      actionResults: [manifestReceipt, pageReceipt],
    });
  });

  it("marks bounded partial work failed when the final response still says it is incomplete", async () => {
    let callCount = 0;
    const receipt = {
      success: true,
      text: "Created package.json",
      data: {
        actionName: "WRITE_FILE",
        mutationAction: "WRITE_FILE",
        mutationKind: "local-file",
        mutation: {
          action: "WRITE_FILE",
          success: true,
          requestedPath: "package.json",
          resolvedPath: "/workspace/package.json",
        },
      },
    };
    const { context } = createContext({
      onHandleMessage: async () => {
        callCount += 1;
        return {
          responseContent: {
            text: "The app is not implemented or verified yet; the build remains to be done.",
          },
          responseMessages: [],
          state: { data: { actionResults: [receipt] } },
        };
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Create and verify the requested app in this workspace.",
    );

    expect(callCount).toBe(12);
    expect(result.runFailureMessage).toContain(
      "still incomplete after the agent's continuation attempts",
    );
    expect(result.runFailureMessage).toContain("Some local files changed");
    expect(result.response).toBe(result.runFailureMessage);
  });

  it("continues into verification after a silent pass already wrote a verified file", async () => {
    const prompts: string[] = [];
    const writeReceipt = {
      success: true,
      text: "Wrote src/api/worker.ts",
      data: {
        actionName: "WRITE_FILE",
        mutationAction: "WRITE_FILE",
        mutationKind: "local-file",
        mutation: {
          action: "WRITE_FILE",
          success: true,
          requestedPath: "src/api/worker.ts",
          resolvedPath: "/workspace/src/api/worker.ts",
        },
      },
    };
    const buildReceipt: ActionResult = {
      success: true,
      text: "Production build passed.",
      data: {
        actionName: "SHELL",
        command: "bun run build",
        exitCode: 0,
        cwd: "/workspace",
      },
    };
    const { context } = createContext({
      onHandleMessage: async ({ memory, onSettledActionResult }) => {
        const current = memory as Memory;
        prompts.push(String(current.content.text));
        onSettledActionResult?.(writeReceipt);
        if (prompts.length === 1) {
          return {
            responseContent: null,
            responseMessages: [],
            state: { data: { actionResults: [writeReceipt] } },
          };
        }
        return {
          responseContent: { text: "The page is ready; the build passed." },
          responseMessages: [],
          state: { data: { actionResults: [writeReceipt, buildReceipt] } },
        };
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Create the requested backend module in this workspace and run its production build.",
    );

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain(
      "A verified local file change has already occurred",
    );
    expect(prompts[1]).toContain("avoid repeating completed writes");
    expect(prompts[1]).not.toContain("without a verified file change");
    expect(result.response).toBe("The page is ready; the build passed.");
    expect(result.runFailureMessage).toBeUndefined();
  });

  it("returns a concrete failure after the single bounded continuation is still silent", async () => {
    const calls: Memory[] = [];
    const inspection = {
      success: true,
      text: "Inspected the requested directory.",
      userFacingText: "Inspected the requested directory.",
      verifiedUserFacing: true,
      data: { actionName: "DOOLITTLE_WORKSPACE" },
    };
    const { context } = createContext({
      onHandleMessage: async ({ memory, onSettledActionResult }) => {
        calls.push(memory as Memory);
        onSettledActionResult?.(inspection);
        return {
          responseContent: null,
          responseMessages: [],
          state: { data: { actionResults: [inspection] } },
        };
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Build an app in this workspace.",
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.id).toBe(calls[1]?.id);
    expect(result.runFailureMessage).toContain(
      "reply was not backed by a verified workspace change",
    );
    expect(result.response).toContain("No verified file changes were recorded");
  });

  it("stops after a terminal managed coding-agent failure and preserves its actionable error", async () => {
    let callCount = 0;
    const failure =
      "Codex cannot use the selected model with this account. Choose a model exposed by the installed Codex CLI in the conversation's model menu, then retry.";
    const failedDelegation = {
      success: false,
      text: failure,
      userFacingText: failure,
      verifiedUserFacing: true,
      continueChain: false,
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        userFacingText: failure,
        verifiedUserFacing: true,
        delegatedExecution: {
          status: "failed",
          failureMessage: failure,
          verifiedLocalMutation: false,
        },
      },
    };
    const { context } = createContext({
      onHandleMessage: async ({ onSettledActionResult }) => {
        callCount += 1;
        onSettledActionResult?.(failedDelegation);
        return {
          responseContent: { text: "The task is complete." },
          responseMessages: [],
          state: { data: { actionResults: [failedDelegation] } },
        };
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Create a blog app in this workspace and run the build.",
    );

    expect(callCount).toBe(1);
    expect(result.response).toBe(failure);
    expect(result.runFailureMessage).toBe(failure);
    expect(result.actionResults).toEqual([failedDelegation]);
  });

  it("starts a standalone SDK trajectory and leaves model-call logging to runtime.useModel", async () => {
    const started: unknown[] = [];
    const ended: unknown[] = [];
    const llmCalls: Array<Record<string, unknown>> = [];
    const trajectoryLogger = {
      isEnabled: () => true,
      startTrajectory: (agentId: string, options: Record<string, unknown>) => {
        started.push({ agentId, options });
        return "trajectory-1";
      },
      startStep: (trajectoryId: string) => {
        expect(trajectoryId).toBe("trajectory-1");
        return "step-1";
      },
      flushWriteQueue: (trajectoryId: string) => {
        expect(trajectoryId).toBe("trajectory-1");
      },
      endTrajectory: (trajectoryId: string, status: string) => {
        ended.push({ trajectoryId, status });
      },
      logLlmCall: (params: Record<string, unknown>) => {
        llmCalls.push(params);
      },
    };
    const { context } = createContext({ trajectoryLogger });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: (current: string, incoming: string) => ({
        kind: "append",
        emittedText: incoming,
        nextText: current + incoming,
      }),
      extractCompatTextContent: (content) =>
        typeof content === "object" && content !== null && "text" in content
          ? ((content as { text?: string }).text ?? "")
          : "",
    });
    const memory = {
      id: "memory-sdk" as UUID,
      roomId: "room-sdk" as UUID,
      entityId: "entity-sdk" as UUID,
      content: {
        text: "bridge this turn",
        source: "cli",
        channelType: ChannelType.DM,
      },
      metadata: {
        source: "cli",
        doolittle: {
          userId: "alice",
        },
      },
    } as Memory;

    const result = await executeProviderMessageTurn({
      context,
      memory,
      sessionId: "session-sdk",
      runId: "run-sdk",
      streamState,
      messagePolicy: {
        useMultiStep: true,
        maxIterations: 3,
      },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      onNotice: undefined,
      connectionSource: "cli",
      roomId: "room-sdk",
      buildProviderFailureMessage: () => "fatal",
    });

    expect(result.response).toBe("response message");
    expect(started).toHaveLength(1);
    expect(ended).toEqual([
      { trajectoryId: "trajectory-1", status: "completed" },
    ]);
    expect(
      (memory.metadata as { trajectoryStepId?: string }).trajectoryStepId,
    ).toBe("step-1");
    expect(llmCalls).toEqual([]);
  });

  it("surfaces SDK message-service failures without a second executor", async () => {
    const planningFailure = new Error("dynamic prompt parse failed");
    const { context, notices } = createContext({
      onHandleMessage: async () => {
        throw planningFailure;
      },
    });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: () => ({
        kind: "append",
        emittedText: "",
        nextText: "",
      }),
      extractCompatTextContent: () => "",
    });

    const result = await executeProviderMessageTurn({
      context,
      memory: {
        id: "memory-2" as UUID,
        roomId: "room-2" as UUID,
        entityId: "entity-2" as UUID,
        content: {
          text: "provider response",
          source: "cli",
          channelType: ChannelType.DM,
        },
        metadata: { source: "cli" },
      } as Memory,
      streamState,
      messagePolicy: {
        useMultiStep: false,
        maxIterations: 1,
      },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      onNotice: undefined,
      connectionSource: "cli",
      roomId: "room-2",
      buildProviderFailureMessage: (_provider, _model, error) => {
        expect(error).toBe(planningFailure);
        return "turn failed";
      },
    });

    expect(result.handledMessage).toBe(false);
    expect(result.response).toBe("turn failed");
    expect(result.runFailureMessage).toBe("turn failed");
    expect(notices).toEqual([]);
    expect(streamState.getResponse()).toBe("turn failed");
  });

  it("preserves a completed managed coding delegation when parent continuation fails", async () => {
    const completion = {
      success: true,
      text: [
        "The codex coding agent finished its turn in /workspace.",
        "0 file change(s) were verified against pre-run fingerprints.",
        "Agent report: inspected package.json and README; no files changed.",
      ].join(" "),
      continueChain: true,
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        delegatedExecution: {
          sessionId: "child-1",
          agentType: "codex",
          workdir: "/workspace",
          status: "completed",
          stopReason: "end_turn",
          exitCode: 0,
          summary: "Inspected package.json and README; no files changed.",
          observedTools: [],
          changedFiles: [],
          verifiedLocalMutation: false,
        },
      },
    };
    const { context, notices } = createContext({
      onHandleMessage: async ({ onSettledActionResult }) => {
        onSettledActionResult?.(completion);
        throw new Error("parent model continuation failed");
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Inspect this workspace without changing files",
    );

    expect(result).toMatchObject({
      handledMessage: true,
      response: completion.text,
      runFailureMessage: undefined,
      actionResults: [completion],
    });
    expect(notices).toEqual([]);
  });

  it("recovers a beta SDK continuation failure from the turn-scoped managed receipt", async () => {
    const completion = {
      success: true,
      text: "The codex coding agent completed its read-only inspection.",
      continueChain: true,
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        delegatedExecution: {
          sessionId: "child-beta",
          agentType: "codex",
          workdir: "/workspace",
          status: "completed",
          stopReason: "end_turn",
          exitCode: 0,
          summary: "Inspected package.json and README.md.",
          observedTools: [],
          changedFiles: [],
          verifiedLocalMutation: false,
        },
      },
    };
    let context: AgentExecutionContext;
    ({ context } = createContext({
      onHandleMessage: async () => {
        recordScopedTurnActionResult(context.runtime, completion);
        throw new Error("beta SDK parent continuation failed");
      },
    }));

    const result = await runWithTurnRuntimeScope(
      context.runtime,
      { settings: new Map(), settledActionResults: [] },
      () => executeTestTurn(context, "codex", "Inspect without changes"),
    );

    expect(result).toMatchObject({
      handledMessage: true,
      response: completion.text,
      runFailureMessage: undefined,
      actionResults: [completion],
    });
  });

  it.each([
    {
      label: "ordinary tool",
      result: {
        success: true,
        text: "Read package.json",
        data: { actionName: "READ_FILE" },
      },
    },
    {
      label: "failed delegation",
      result: {
        success: false,
        text: "The coding agent failed.",
        data: {
          actionName: "TASKS_SPAWN_AGENT",
          delegatedExecution: {
            status: "failed",
            stopReason: "error",
            exitCode: 1,
          },
        },
      },
    },
  ])(
    "does not recover a parent failure from $label evidence",
    async ({ result }) => {
      const { context } = createContext({
        onHandleMessage: async ({ onSettledActionResult }) => {
          onSettledActionResult?.(result);
          throw new Error("parent model continuation failed");
        },
      });

      const outcome = await executeTestTurn(context, "codex", "Run this task");

      expect(outcome.handledMessage).toBe(false);
      expect(outcome.runFailureMessage).toContain(
        "parent model continuation failed",
      );
    },
  );

  it("emits status notices and returns provider failures for non-recoverable errors", async () => {
    const { context, notices } = createContext({
      onHandleMessage: async () => {
        throw new Error("timeout");
      },
      captureNotice: (notice) => {
        expect(notice).toBe("provider unavailable");
      },
    });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: () => ({
        kind: "append",
        emittedText: "",
        nextText: "",
      }),
      extractCompatTextContent: () => "",
    });

    const result = await executeProviderMessageTurn({
      context,
      memory: {
        id: "memory-3" as UUID,
        roomId: "room-3" as UUID,
        entityId: "entity-3" as UUID,
        content: {
          text: "provider response",
          source: "cli",
          channelType: ChannelType.DM,
        },
        metadata: { source: "cli" },
      } as Memory,
      streamState,
      messagePolicy: {
        useMultiStep: true,
        maxIterations: 4,
      },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      onNotice: async (notice: { message: string }) => {
        notices.push(notice.message);
      },
      connectionSource: "cli",
      roomId: "room-3",
      buildProviderFailureMessage: () => "provider unavailable",
    });

    expect(result.handledMessage).toBe(false);
    expect(result.response).toBe("provider unavailable");
    expect(result.runFailureMessage).toBe("provider unavailable");
    expect(notices).toEqual(["provider unavailable"]);
    expect(streamState.getResponse()).toBe("provider unavailable");
  });

  it("keeps the provider failure when the status notice callback rejects", async () => {
    const { context } = createContext({
      onHandleMessage: async () => {
        throw new Error("planning failed");
      },
    });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: () => ({
        kind: "append",
        emittedText: "",
        nextText: "",
      }),
      extractCompatTextContent: () => "",
    });

    const result = await executeProviderMessageTurn({
      context,
      memory: {
        id: "memory-notice-rejection" as UUID,
        roomId: "room-notice-rejection" as UUID,
        entityId: "entity-notice-rejection" as UUID,
        content: {
          text: "run this",
          source: "cli",
          channelType: ChannelType.DM,
        },
      } as Memory,
      streamState,
      messagePolicy: { useMultiStep: true, maxIterations: 4 },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      connectionSource: "cli",
      roomId: "room-notice-rejection",
      onNotice: async () => {
        throw new Error("notice transport closed");
      },
      buildProviderFailureMessage: () => "provider unavailable",
    });

    expect(result.runFailureMessage).toBe("provider unavailable");
    expect(result.response).toBe("provider unavailable");
    expect(streamState.getResponse()).toBe("provider unavailable");
  });

  it("propagates cancellation instead of rewriting it as a provider failure", async () => {
    const controller = new AbortController();
    const { context, notices } = createContext({
      onHandleMessage: async () => {
        controller.abort();
        throw new Error("provider aborted");
      },
      captureNotice: (notice) => notices.push(notice),
    });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: () => ({
        kind: "append",
        emittedText: "",
        nextText: "",
      }),
      extractCompatTextContent: () => "",
    });

    await expect(
      executeProviderMessageTurn({
        context,
        memory: {
          id: "memory-cancel" as UUID,
          roomId: "room-cancel" as UUID,
          entityId: "entity-cancel" as UUID,
          content: {
            text: "stop this turn",
            source: "desktop",
            channelType: ChannelType.DM,
          },
          metadata: { source: "desktop" },
        } as Memory,
        streamState,
        messagePolicy: {
          useMultiStep: true,
          maxIterations: 4,
        },
        abortSignal: controller.signal,
        settingsDuring: createTurnSettings(),
        onNotice: async (notice) => {
          notices.push(notice.message);
        },
        connectionSource: "desktop",
        roomId: "room-cancel",
        buildProviderFailureMessage: () => "provider unavailable",
      }),
    ).rejects.toThrow("provider aborted");
    expect(notices).toEqual([]);
  });
});
