import { extractSessionContext, type Media } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import { syncProviderSettings } from "@/runtime/linked-provider-accounts";
import { getEffectiveActivePersonality } from "@/runtime/native/service-bridge/ownership";
import { runProviderModelTurn } from "./chat-turn/provider";

function createProviderContext() {
  const progressPhases: string[] = [];
  const notices: string[] = [];
  const personalityTransitions: string[] = [];
  const runtimeSettings: Array<{ key: string; value: unknown }> = [];
  const emittedEvents: string[] = [];
  const thinkingSessions: string[] = [];
  let handledMemory: unknown;
  const settingsState = {
    model: {
      provider: "openai",
      model: "gpt-4.1",
      baseUrl: "https://api.example.com/v1",
      temperature: 0.2,
      maxTokens: 2048,
    },
  };
  let activePersonalityId = "default";
  let conversationId: unknown = "previous-conversation";
  let actionResults: unknown[] = [];
  let messageOptions: unknown;
  const runtimeSettingValues = new Map<string, unknown>([
    ["runtimeSettings", JSON.stringify({ model: settingsState.model })],
  ]);

  const context = {
    runtime: {
      agentId: "agent-1",
      logger: {
        warn: () => undefined,
      },
      getService: (name: string) => {
        if (name !== "personality") {
          return null;
        }
        return {
          activeId: () => activePersonalityId,
          get: (id: string) => ({ id }),
          activate: (id: string) => {
            activePersonalityId = id;
            personalityTransitions.push(id);
            return { id };
          },
        };
      },
      getSetting: (key: string) => {
        if (runtimeSettingValues.has(key)) {
          return runtimeSettingValues.get(key);
        }
        if (key === "ELIZAOS_CLOUD_CONVERSATION_ID") {
          return conversationId;
        }
        return undefined;
      },
      setSetting: (key: string, value: unknown) => {
        runtimeSettingValues.set(key, value);
        if (key === "ELIZAOS_CLOUD_CONVERSATION_ID") {
          conversationId = value;
        }
        runtimeSettings.push({ key, value });
      },
      emitEvent: async (eventType: string) => {
        emittedEvents.push(eventType);
      },
      messageService: {
        handleMessage: async (
          _runtime: unknown,
          _memory: unknown,
          onContent: (content: unknown) => Promise<unknown>,
          options?: unknown,
        ) => {
          handledMemory = _memory;
          messageOptions = options;
          await onContent({ text: "hello from provider" });
          return {
            responseMessages: [
              {
                id: "resp-1",
                content: {
                  text: "hello from provider",
                },
              },
            ],
          };
        },
      },
      getActionResults: () => actionResults,
    },
    services: {
      personalities: {
        getActive: () => ({
          id: activePersonalityId,
        }),
        setActive: (id: string) => {
          activePersonalityId = id;
          personalityTransitions.push(id);
        },
      },
      sessions: {
        continuityKey: (sessionId: string) =>
          sessionId === "session-1" ? "continuity-1" : "continuity-2",
      },
      runController: {
        updateThinking: (sessionId: string) => {
          thinkingSessions.push(sessionId);
        },
      },
      settings: {
        get: () => ({
          model: {
            ...settingsState.model,
          },
        }),
        set: (path: string, value: unknown) => {
          const modelKey = path.replace(
            "model.",
            "",
          ) as keyof typeof settingsState.model;
          settingsState.model[modelKey] = value as never;
        },
      },
    },
    config: {},
  } as unknown as AgentExecutionContext;

  return {
    context,
    emittedEvents,
    notices,
    personalityTransitions,
    progressPhases,
    runtimeSettings,
    settingsState,
    thinkingSessions,
    getConversationId: () => conversationId,
    setActionResults: (next: unknown[]) => {
      actionResults = next;
    },
    getHandledMemory: () => handledMemory,
    getMessageOptions: () => messageOptions,
    options: {
      personalityId: "reviewer",
      onNotice: async (notice: { message: string }) => {
        notices.push(notice.message);
      },
      onResponseProgress: async (update: { phase: string }) => {
        progressPhases.push(update.phase);
      },
    },
  };
}

function createTurn() {
  return {
    sessionId: "session-1",
    roomId: "room-1",
    entityId: "user-1",
    messageId: "message-1",
    connectionSource: "cli",
    localInteractive: true,
  } as unknown as Parameters<typeof runProviderModelTurn>[0]["turn"];
}

describe("chat turn provider seam", () => {
  it("applies temporary provider settings, streams the response, and restores state", async () => {
    const harness = createProviderContext();
    const settingsBefore = harness.context.services.settings.get();
    const settingsDuring = {
      model: {
        provider: "openai",
        model: "gpt-4.1-mini",
        baseUrl: "https://api.example.com/alt",
        temperature: 0.1,
        maxTokens: 1024,
      },
    } as typeof settingsBefore;

    const result = await runProviderModelTurn({
      context: harness.context,
      turn: createTurn(),
      userId: "alice",
      effectiveMessage: "Tell me what changed.",
      settingsBefore,
      settingsDuring,
      messagePolicy: {
        runDepth: "standard",
        useMultiStep: true,
        maxIterations: 3,
        toolProgressMode: "all",
      },
      options: harness.options,
      attachments: [
        {
          id: "attachment-1",
          url: "attachment://attachment-1",
          title: "review.md",
          source: "desktop",
          contentType: "document",
          text: "# Review",
          _data: "IyBSZXZpZXc=",
          _mimeType: "text/markdown",
        } as Media & { _data: string; _mimeType: string },
      ],
    });

    expect(result.handledMessage).toBe(true);
    expect(result.response).toBe("hello from provider");
    expect(result.runFailureMessage).toBeUndefined();
    expect(result.messageId).toBe("message-1");
    expect(result.responseMessages).toHaveLength(1);
    expect(harness.progressPhases).toEqual([]);
    expect(harness.getMessageOptions()).toMatchObject({
      continueAfterActions: true,
    });
    expect(harness.thinkingSessions).toEqual(["session-1"]);
    expect(harness.personalityTransitions).toEqual([]);
    expect(harness.settingsState.model).toEqual(settingsBefore.model);
    expect(harness.getConversationId()).toBe("previous-conversation");
    expect(harness.emittedEvents).toHaveLength(0);
    expect(harness.runtimeSettings).toEqual([]);
    const sessionContext = extractSessionContext(
      harness.getHandledMemory() as Parameters<typeof extractSessionContext>[0],
    );
    expect(sessionContext?.sessionId).toBe("session-1");
    expect(sessionContext?.sessionKey).toBe("continuity-1");
    expect(sessionContext?.entry?.model).toBe("gpt-4.1-mini");
    expect(
      (
        harness.getHandledMemory() as {
          content?: { attachments?: unknown[] };
        }
      )?.content?.attachments,
    ).toEqual([
      {
        id: "attachment-1",
        url: "attachment://attachment-1",
        title: "review.md",
        source: "desktop",
        contentType: "document",
        text: "# Review",
        _data: "IyBSZXZpZXc=",
        _mimeType: "text/markdown",
      },
    ]);
  });

  it("surfaces SDK failures through the unified turn-failure path", async () => {
    const harness = createProviderContext();
    const settingsBefore = harness.context.services.settings.get();
    harness.context.runtime.messageService = {
      handleMessage: async () => {
        throw new Error("parse error in prompt");
      },
    } as unknown as typeof harness.context.runtime.messageService;

    const result = await runProviderModelTurn({
      context: harness.context,
      turn: createTurn(),
      userId: "alice",
      effectiveMessage: "Inspect the repo and fix it.",
      settingsBefore,
      settingsDuring: settingsBefore,
      messagePolicy: {
        runDepth: "standard",
        useMultiStep: true,
        maxIterations: 3,
        toolProgressMode: "all",
      },
      options: harness.options,
    });

    expect(result.handledMessage).toBe(false);
    expect(result.response).toContain("OpenAI");
    expect(result.response).toContain("parse error in prompt");
    expect(result.runFailureMessage).toBe(result.response);
    expect(harness.notices).toEqual([result.response]);
    expect(harness.settingsState.model).toEqual(settingsBefore.model);
  });

  it("withholds an early tool preamble until the SDK returns its terminal synthesis", async () => {
    const harness = createProviderContext();
    const settingsBefore = harness.context.services.settings.get();
    harness.setActionResults([
      {
        success: true,
        data: { actionName: "WEB_SEARCH" },
      },
    ]);
    harness.context.runtime.messageService = {
      handleMessage: async (
        _runtime: unknown,
        _memory: unknown,
        onContent: (content: { text?: string }) => Promise<unknown>,
        options?: { onStreamChunk?: (chunk: string) => Promise<void> },
      ) => {
        await onContent({
          text: "I don't have a web-search tool available, but I can try.",
        });
        await options?.onStreamChunk?.(
          '{"type":"tool_call","toolName":"WEB_SEARCH","arguments":{"query":"Hacker News today"}}',
        );
        await options?.onStreamChunk?.(
          '{"type":"tool_result","toolName":"WEB_SEARCH","output":"front-page results"}',
        );
        return {
          responseContent: {
            text: "I checked Hacker News. Here are the leading stories…",
          },
          responseMessages: [
            {
              id: "final-1",
              content: {
                text: "I checked Hacker News. Here are the leading stories…",
              },
            },
          ],
        };
      },
    } as unknown as typeof harness.context.runtime.messageService;

    const result = await runProviderModelTurn({
      context: harness.context,
      turn: createTurn(),
      userId: "alice",
      effectiveMessage: "What is news today from Hacker News?",
      settingsBefore,
      settingsDuring: settingsBefore,
      messagePolicy: {
        runDepth: "standard",
        useMultiStep: true,
        maxIterations: 3,
        toolProgressMode: "all",
      },
      options: harness.options,
    });

    expect(result.response).toBe(
      "I checked Hacker News. Here are the leading stories…",
    );
    expect(result.actionResults).toHaveLength(1);
    expect(harness.progressPhases).toEqual([]);
  });

  it("does not promote an action receipt when an action run has no terminal reply", async () => {
    const harness = createProviderContext();
    const settingsBefore = harness.context.services.settings.get();
    harness.setActionResults([
      {
        success: true,
        userFacingText: "Raw search result",
        verifiedUserFacing: true,
        data: { actionName: "WEB_SEARCH" },
      },
    ]);
    harness.context.runtime.messageService = {
      handleMessage: async (
        _runtime: unknown,
        _memory: unknown,
        onContent: (content: { text?: string }) => Promise<unknown>,
      ) => {
        await onContent({ text: "I cannot search the web." });
        return {
          responseMessages: [
            {
              id: "early-1",
              content: { text: "I cannot search the web." },
            },
          ],
        };
      },
    } as unknown as typeof harness.context.runtime.messageService;

    const result = await runProviderModelTurn({
      context: harness.context,
      turn: createTurn(),
      userId: "alice",
      effectiveMessage: "Search the web.",
      settingsBefore,
      settingsDuring: settingsBefore,
      messagePolicy: {
        runDepth: "standard",
        useMultiStep: true,
        maxIterations: 3,
        toolProgressMode: "all",
      },
      options: harness.options,
    });

    expect(result.response).toBe("");
    expect(harness.progressPhases).toEqual([]);
  });

  it("keeps the SDK terminal response canonical when a tool result also has user-facing text", async () => {
    const harness = createProviderContext();
    const settingsBefore = harness.context.services.settings.get();
    harness.context.runtime.messageService = {
      handleMessage: async (
        _runtime: unknown,
        _memory: unknown,
        onContent: (content: { text?: string }) => Promise<unknown>,
      ) => {
        await onContent({ text: "I cannot search the web." });
        return {
          responseContent: {
            thought:
              "Handle a temporary reply failure during running the native tool message runtime.",
            actions: ["REPLY"],
            text: "Something went wrong on my end. Please try again.",
          },
          responseMessages: [],
          state: {
            data: {
              actionResults: [
                {
                  success: true,
                  userFacingText:
                    "### Web results\n\n1. [Hacker News](https://news.ycombinator.com/)",
                  verifiedUserFacing: true,
                  data: { actionName: "WEB_SEARCH" },
                },
              ],
            },
          },
        };
      },
    } as unknown as typeof harness.context.runtime.messageService;

    const result = await runProviderModelTurn({
      context: harness.context,
      turn: createTurn(),
      userId: "alice",
      effectiveMessage: "What is news today from Hacker News?",
      settingsBefore,
      settingsDuring: settingsBefore,
      messagePolicy: {
        runDepth: "standard",
        useMultiStep: true,
        maxIterations: 3,
        toolProgressMode: "all",
      },
      options: harness.options,
    });

    expect(result.response).toBe(
      "Something went wrong on my end. Please try again.",
    );
    expect(result.response).not.toContain(
      "[Hacker News](https://news.ycombinator.com/)",
    );
    expect(result.actionResults).toHaveLength(1);
  });

  it("converts non-recoverable provider failures into a user-facing notice", async () => {
    const harness = createProviderContext();
    const settingsBefore = harness.context.services.settings.get();
    harness.context.runtime.messageService = {
      handleMessage: async () => {
        throw new Error("connection refused");
      },
    } as unknown as typeof harness.context.runtime.messageService;

    const result = await runProviderModelTurn({
      context: harness.context,
      turn: createTurn(),
      userId: "alice",
      effectiveMessage: "Ask the provider for status.",
      settingsBefore,
      settingsDuring: settingsBefore,
      messagePolicy: {
        runDepth: "quick",
        useMultiStep: false,
        maxIterations: 1,
        toolProgressMode: "new",
      },
      options: harness.options,
    });

    expect(result.handledMessage).toBe(false);
    if (!result.runFailureMessage) {
      throw new Error("expected a provider failure message");
    }
    expect(result.response).toBe(result.runFailureMessage);
    expect(result.response).toContain("connection refused");
    expect(harness.notices).toEqual([result.response]);
    expect(harness.settingsState.model).toEqual(settingsBefore.model);
  });

  it("isolates concurrent provider turns and lets persisted settings update immediately", async () => {
    const harness = createProviderContext();
    const firstSettings = harness.context.services.settings.get();
    const codexSettings = {
      model: {
        provider: "codex",
        model: "gpt-5.4",
        baseUrl: "https://ignored.example.com",
        temperature: 0.2,
        maxTokens: 2048,
      },
    } as typeof firstSettings;
    const observedScopes: Array<{
      provider: string;
      model: unknown;
      conversationId: unknown;
      personalityId: string;
    }> = [];
    let releaseStage!: () => void;
    const stagePaused = new Promise<void>((resolve) => {
      releaseStage = resolve;
    });
    let markStageStarted!: () => void;
    const stageStarted = new Promise<void>((resolve) => {
      markStageStarted = resolve;
    });
    let calls = 0;

    harness.context.runtime.messageService = {
      handleMessage: async (runtime: {
        getSetting: (key: string) => unknown;
      }) => {
        const observeScope = () => {
          const provider = JSON.parse(
            String(runtime.getSetting("runtimeSettings")),
          ).model.provider as string;
          observedScopes.push({
            provider,
            model: runtime.getSetting("OPENAI_LARGE_MODEL"),
            conversationId: runtime.getSetting("ELIZAOS_CLOUD_CONVERSATION_ID"),
            personalityId: getEffectiveActivePersonality(
              runtime as Parameters<typeof getEffectiveActivePersonality>[0],
            ).id,
          });
        };
        observeScope();
        calls += 1;
        if (calls === 1) {
          markStageStarted();
          await stagePaused;
          // Represents the planner/tool continuation after Stage 1.
          observeScope();
        }
        return {
          responseContent: { text: "done" },
          responseMessages: [],
          state: { data: {} },
        };
      },
    } as unknown as typeof harness.context.runtime.messageService;

    const firstTurn = runProviderModelTurn({
      context: harness.context,
      turn: createTurn(),
      userId: "alice",
      effectiveMessage: "First turn",
      settingsBefore: firstSettings,
      settingsDuring: firstSettings,
      messagePolicy: {
        runDepth: "standard",
        useMultiStep: true,
        maxIterations: 3,
        toolProgressMode: "all",
      },
    });
    await stageStarted;

    const secondTurn = runProviderModelTurn({
      context: harness.context,
      turn: {
        ...createTurn(),
        sessionId: "session-2",
        messageId: "message-2",
      },
      userId: "bob",
      effectiveMessage: "Second turn",
      settingsBefore: codexSettings,
      settingsDuring: codexSettings,
      messagePolicy: {
        runDepth: "standard",
        useMultiStep: true,
        maxIterations: 3,
        toolProgressMode: "all",
      },
      options: { personalityId: "architect" },
    });
    await secondTurn;

    harness.context.services.settings.set("model.provider", "codex");
    harness.context.services.settings.set("model.model", "gpt-5.4");
    syncProviderSettings(
      harness.context,
      harness.context.services.settings.get(),
    );
    expect(
      JSON.parse(String(harness.context.runtime.getSetting("runtimeSettings")))
        .model.provider,
    ).toBe("codex");

    releaseStage();
    await firstTurn;

    expect(observedScopes).toEqual([
      {
        provider: "openai",
        model: "gpt-4.1",
        conversationId: "continuity-1",
        personalityId: "default",
      },
      {
        provider: "codex",
        model: "gpt-5.4",
        conversationId: "continuity-2",
        personalityId: "architect",
      },
      {
        provider: "openai",
        model: "gpt-4.1",
        conversationId: "continuity-1",
        personalityId: "default",
      },
    ]);
    expect(harness.personalityTransitions).toEqual([]);
  });
});
