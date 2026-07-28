import { describe, expect, it } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import {
  prepareNativeTurnSetup,
  resolveNativeMessagePolicy,
} from "./chat-turn/native/setup";

function createContext(): AgentExecutionContext {
  return {
    runtime: {
      character: { name: "Doolittle" },
    },
    services: {
      settings: {
        get: () => ({
          agent: {
            runDepth: "standard",
            maxIterations: 6,
            toolProgressMode: "all",
          },
          model: {
            provider: "ollama",
            model: "granite4.1:3b",
          },
        }),
      },
      sessions: {
        storeMessage: () => undefined,
      },
      executionApprovals: {
        latestPendingForSession: () => null,
      },
      runController: {
        startTurn: () => undefined,
      },
      userProfiles: {
        observe: () => ({
          displayName: undefined,
          facts: [],
          preferences: [],
        }),
      },
      memory: {
        add: () => undefined,
      },
    },
    config: {
      workspaceDir: "/tmp",
    },
  } as unknown as AgentExecutionContext;
}

describe("ElizaOS-native chat turn setup", () => {
  it("maps product execution settings to an SDK message budget without classifying message text", () => {
    const context = createContext();
    const request = {
      userId: "alice",
      message: "hello",
      source: "cli",
    } as const;

    const setup = prepareNativeTurnSetup({
      input: request,
      effectiveInput: request,
      context,
    });

    expect(setup.turn.sessionId).toBe("room:alice");
    expect(setup.messagePolicy).toEqual({
      runDepth: "standard",
      maxIterations: 6,
      toolProgressMode: "all",
      useMultiStep: true,
    });
    expect(setup).not.toHaveProperty("turnClassification");
    expect(setup).not.toHaveProperty("derivedTurnPolicy");
  });

  it("lets quick mode disable the planner loop while preserving SDK direct replies", () => {
    expect(
      resolveNativeMessagePolicy({
        runDepth: "quick",
        maxIterations: 12,
        toolProgressMode: "new",
      }),
    ).toEqual({
      runDepth: "quick",
      maxIterations: 12,
      toolProgressMode: "new",
      useMultiStep: false,
    });
  });
});
