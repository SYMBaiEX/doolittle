import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import type { NativeTurnSetup } from "./chat-turn/native";
import { runPostCommandTurn } from "./chat-turn/post-command";

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

describe("chat turn post-command seam", () => {
  it("returns shell responses without entering native flow", async () => {
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
        runShellPostCommandTurn: async () => "shell-response",
        prepareNativeTurnSetup: () => {
          turnSetupLog.push("called");
          throw new Error("should not run");
        },
        runNativeMessageTurn: async () => {
          runNativeLog.push("called");
          return "native-response";
        },
      },
    );

    expect(response).toBe("shell-response");
    expect(turnSetupLog).toHaveLength(0);
    expect(runNativeLog).toHaveLength(0);
    expect(perf.flushes).toHaveLength(0);
  });

  it("builds native overrides and forwards them into native turn", async () => {
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
        runShellPostCommandTurn: async () => undefined,
        prepareNativeTurnSetup: () => {
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
            derivedTurnPolicy: {
              useMultiStep: false,
              maxIterations: 1,
              toolProgressMode: "all",
            },
            turnClassification: {
              simpleChat: false,
              likelyLocalTask: false,
              requiresFullContext: false,
              actionOriented: false,
              informationalOnly: true,
              shouldUseMultiStep: false,
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
        runNativeMessageTurn: async (input) => {
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
