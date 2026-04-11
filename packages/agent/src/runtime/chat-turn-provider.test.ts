import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import { runProviderModelTurn } from "./chat-turn/provider";

function createProviderContext() {
  const progressPhases: string[] = [];
  const notices: string[] = [];
  const personalityTransitions: string[] = [];
  const runtimeSettings: Array<{ key: string; value: unknown }> = [];
  const emittedEvents: string[] = [];
  const thinkingSessions: string[] = [];
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
  let toolProfile: unknown = "previous-profile";
  let conversationId: unknown = "previous-conversation";

  const context = {
    runtime: {
      agentId: "agent-1",
      logger: {
        warn: () => undefined,
      },
      getSetting: (key: string) => {
        if (key === "DOOLITTLE_TOOL_PROFILE") {
          return toolProfile;
        }
        if (key === "ELIZAOS_CLOUD_CONVERSATION_ID") {
          return conversationId;
        }
        return undefined;
      },
      setSetting: (key: string, value: unknown) => {
        if (key === "DOOLITTLE_TOOL_PROFILE") {
          toolProfile = value;
        }
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
        ) => {
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
        continuityKey: () => "continuity-1",
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
    getToolProfile: () => toolProfile,
    getConversationId: () => conversationId,
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
      effectiveMessage: "Tell me what changed.",
      settingsBefore,
      settingsDuring,
      capabilityProfile: "coding",
      derivedTurnPolicy: {
        useMultiStep: true,
        maxIterations: 3,
      },
      options: harness.options,
      loadDirectLocalIntent: async () => undefined,
    });

    expect(result.handledMessage).toBe(true);
    expect(result.response).toBe("hello from provider");
    expect(result.runFailureMessage).toBeUndefined();
    expect(harness.progressPhases).toEqual(["model"]);
    expect(harness.thinkingSessions).toEqual(["session-1"]);
    expect(harness.personalityTransitions).toEqual(["reviewer", "default"]);
    expect(harness.settingsState.model).toEqual(settingsBefore.model);
    expect(harness.getToolProfile()).toBe("previous-profile");
    expect(harness.getConversationId()).toBe("previous-conversation");
    expect(harness.emittedEvents).toHaveLength(2);
    expect(
      harness.runtimeSettings.some(
        (entry) =>
          entry.key === "ELIZAOS_CLOUD_CONVERSATION_ID" &&
          entry.value === "continuity-1",
      ),
    ).toBe(true);
  });

  it("preserves recoverable planning failures for the direct-local fallback path", async () => {
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
      effectiveMessage: "Inspect the repo and fix it.",
      settingsBefore,
      settingsDuring: settingsBefore,
      capabilityProfile: "coding",
      derivedTurnPolicy: {
        useMultiStep: true,
        maxIterations: 3,
      },
      options: harness.options,
      loadDirectLocalIntent: async () => ({
        directLocalIntent: {
          label: "workspace:inspect",
        },
      }),
    });

    expect(result.handledMessage).toBe(false);
    expect(result.response).toBe("");
    expect(result.runFailureMessage).toBe("parse error in prompt");
    expect(harness.notices).toEqual([]);
    expect(harness.settingsState.model).toEqual(settingsBefore.model);
    expect(harness.getToolProfile()).toBe("previous-profile");
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
      effectiveMessage: "Ask the provider for status.",
      settingsBefore,
      settingsDuring: settingsBefore,
      capabilityProfile: "messaging",
      derivedTurnPolicy: {
        useMultiStep: false,
        maxIterations: 1,
      },
      options: harness.options,
      loadDirectLocalIntent: async () => undefined,
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
});
