import { describe, expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import type { NativeTurnSetup } from "./chat-turn/native";

function createContext(): AgentExecutionContext {
  return {
    runtime: {
      logger: {
        info: () => undefined,
      },
    },
    services: {
      settings: {
        get: () => ({
          model: {
            provider: "provider-base",
            model: "model-base",
            baseUrl: "https://provider.example",
            temperature: 0.2,
            maxTokens: 2048,
          },
        }),
      },
    },
    config: {},
  } as unknown as AgentExecutionContext;
}

function createPerf() {
  const flushes: Array<{
    path: string;
    sessionId: string;
    source: string;
  }> = [];
  return {
    mark: () => undefined,
    flush: (
      _logger: unknown,
      metadata: { path: string; sessionId: string; source: string },
    ) => {
      flushes.push(metadata);
    },
    flushes,
  };
}

async function loadRunPostCommandTurn() {
  const { runPostCommandTurn } = await import("./chat-turn/post-command");
  return runPostCommandTurn;
}

describe("chat turn post-command seam", () => {
  it("forwards explicit shell shortcuts into the native Eliza message flow", async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
    const runPostCommandTurn = await loadRunPostCommandTurn();

    const context = createContext();
    const perf = createPerf();
    const turnSetupLog: string[] = [];
    const runNativeLog: string[] = [];

    const response = await runPostCommandTurn(
      {
        userId: "alice",
        message: "!pwd",
        source: "cli",
      },
      {
        userId: "alice",
        message: "!pwd",
        source: "cli",
      },
      context,
      {
        runtimeOverrides: {
          model: "override-model",
        },
      },
      perf,
      {
        prepareNativeTurnSetup: async () => {
          turnSetupLog.push("called");
          return {
            turn: {
              agentName: "Doolittle",
              localInteractive: true,
              connectionSource: "cli",
              sessionId: "room-alice",
              roomId: "chat-room",
              worldId: "world-1",
              entityId: "entity-1",
              messageServerId: "server-1",
              messageId: "message-1",
              settings: context.services.settings.get(),
              runId: "run-id",
            },
            scheduleProfileObservation: () => undefined,
            messagePolicy: {
              runDepth: "quick",
              useMultiStep: false,
              maxIterations: 1,
              toolProgressMode: "all",
            },
            settingsBefore: context.services.settings.get(),
          } as NativeTurnSetup;
        },
        runNativeMessageTurn: async () => {
          runNativeLog.push("called");
          return "native-response";
        },
      },
    );

    expect(response).toBe("native-response");
    expect(turnSetupLog).toHaveLength(1);
    expect(runNativeLog).toHaveLength(1);
    expect(perf.flushes).toHaveLength(0);
  });

  it("builds native overrides and forwards them into native turn", async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
    const runPostCommandTurn = await loadRunPostCommandTurn();

    const context = createContext();
    const perf = createPerf();
    let observedSetupInput:
      | {
          message: string;
          source?: string | undefined;
        }
      | undefined;
    let observedNativeOptions:
      | {
          runtimeOverrides?: {
            model?: string;
            provider?: string;
            baseUrl?: string;
            temperature?: number;
            maxTokens?: number;
          };
        }
      | undefined;
    let observedSettingsDuring:
      | {
          model: {
            provider: string;
            model: string;
            baseUrl: string;
            temperature: number;
            maxTokens: number;
          };
        }
      | undefined;

    const response = await runPostCommandTurn(
      {
        userId: "alice",
        message: "summarize project",
        source: "cli",
      },
      {
        userId: "alice",
        message: "summarize project",
        source: "cli",
      },
      context,
      {
        runtimeOverrides: {
          provider: "provider-override",
          model: "model-override",
          temperature: 0.1,
          maxTokens: 1024,
          personalityId: "personality-override",
        },
      },
      perf,
      {
        prepareNativeTurnSetup: async () => {
          observedSetupInput = {
            message: "summarize project",
            source: "cli",
          };
          return {
            turn: {
              agentName: "Doolittle",
              localInteractive: true,
              connectionSource: "cli",
              sessionId: "room-alice",
              roomId: "chat-room",
              worldId: "world-1",
              entityId: "entity-1",
              messageServerId: "server-1",
              messageId: "message-1",
              settings: {
                model: {
                  provider: "provider-base",
                  model: "model-base",
                  baseUrl: "https://provider.example",
                  temperature: 0.2,
                  maxTokens: 2048,
                },
              },
              runId: "run-id",
            },
            scheduleProfileObservation: () => undefined,
            messagePolicy: {
              runDepth: "quick",
              useMultiStep: false,
              maxIterations: 1,
              toolProgressMode: "all",
            },
            settingsBefore: {
              model: {
                provider: "provider-base",
                model: "model-base",
                baseUrl: "https://provider.example",
                temperature: 0.2,
                maxTokens: 2048,
              },
            },
          } as NativeTurnSetup;
        },
        runNativeMessageTurn: async (input: {
          options?:
            | {
                runtimeOverrides?: {
                  model?: string;
                  provider?: string;
                  baseUrl?: string;
                  temperature?: number;
                  maxTokens?: number;
                };
              }
            | undefined;
          settingsDuring: {
            model: {
              provider: string;
              model: string;
              baseUrl: string;
              temperature: number;
              maxTokens: number;
            };
          };
        }) => {
          observedNativeOptions = input.options;
          observedSettingsDuring = input.settingsDuring as {
            model: {
              provider: string;
              model: string;
              baseUrl: string;
              temperature: number;
              maxTokens: number;
            };
          };
          return "native-result";
        },
      },
    );

    expect(response).toBe("native-result");
    expect(observedSetupInput?.message).toBe("summarize project");
    expect(observedNativeOptions).toBeDefined();
    expect(observedSettingsDuring).toEqual({
      model: {
        provider: "provider-override",
        model: "model-override",
        baseUrl: "https://provider.example",
        temperature: 0.1,
        maxTokens: 1024,
      },
    });
  });
});
