import {
  type Action,
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
    return executeProviderMessageTurn({
      context,
      memory: {
        id: "memory-failure" as UUID,
        roomId: "room-failure" as UUID,
        entityId: "entity-failure" as UUID,
        content: { text, source: "cli", channelType: ChannelType.DM },
      } as Memory,
      streamState: createProviderStreamState({
        resolveStreamingUpdate: (current, incoming) => ({
          kind: "append",
          emittedText: incoming,
          nextText: current + incoming,
        }),
        extractCompatTextContent: () => "",
      }),
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
  }

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
      text: "Wrote app/page.tsx",
      data: {
        actionName: "WRITE_FILE",
        mutationAction: "WRITE_FILE",
        mutationKind: "local-file",
        mutation: {
          action: "WRITE_FILE",
          success: true,
          requestedPath: "app/page.tsx",
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
      "Create a Next.js page in the requested workspace and verify it.",
    );

    expect(memoryIds).toEqual(["memory-failure", "memory-failure"]);
    expect(memoryTexts[0]).toBe(
      "Create a Next.js page in the requested workspace and verify it.",
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
      text: "Created app/page.tsx",
      data: {
        actionName: "WRITE_FILE",
        mutationAction: "WRITE_FILE",
        mutationKind: "local-file",
        mutation: {
          action: "WRITE_FILE",
          success: true,
          requestedPath: "app/page.tsx",
          resolvedPath: "/workspace/app/page.tsx",
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
      "Create a Next.js blog app in the requested workspace and verify it.",
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

    expect(callCount).toBe(2);
    expect(result.runFailureMessage).toContain(
      "No verified file changes were recorded",
    );
    expect(result.runFailureMessage).toContain("SHELL");
    expect(result.response).toBe(result.runFailureMessage);
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
      text: "Created app/page.tsx",
      data: {
        actionName: "WRITE_FILE",
        mutationAction: "WRITE_FILE",
        mutationKind: "local-file",
        mutation: {
          action: "WRITE_FILE",
          success: true,
          requestedPath: "app/page.tsx",
          resolvedPath: "/workspace/app/page.tsx",
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
      "Create and verify the requested app in this workspace.",
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

    expect(callCount).toBe(3);
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
      text: "Wrote app/page.tsx",
      data: {
        actionName: "WRITE_FILE",
        mutationAction: "WRITE_FILE",
        mutationKind: "local-file",
        mutation: {
          action: "WRITE_FILE",
          success: true,
          requestedPath: "app/page.tsx",
          resolvedPath: "/workspace/app/page.tsx",
        },
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
          state: { data: { actionResults: [writeReceipt] } },
        };
      },
    });

    const result = await executeTestTurn(
      context,
      "codex",
      "Create the requested app and run its production build.",
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
