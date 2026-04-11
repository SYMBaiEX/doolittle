import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import { prepareNativeTurnSetup } from "./chat-turn/native";

function createContext(): AgentExecutionContext {
  const context = {
    runtime: {
      character: {
        name: "Doolittle",
      },
    },
    services: {
      settings: {
        get: () => ({
          agent: {
            runDepth: "standard",
            maxIterations: 6,
            toolProgressMode: "all",
          },
        }),
      },
      userProfiles: {
        observe: async () => undefined,
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
    },
    config: {
      workspaceDir: "/tmp",
    },
  } as unknown as AgentExecutionContext;
  return context;
}

describe("chat turn native setup", () => {
  it("builds a native setup with session, policies, and cache inputs", () => {
    const context = createContext();
    const setup = prepareNativeTurnSetup({
      input: {
        userId: "alice",
        message: "hello",
        source: "cli",
      },
      effectiveInput: {
        userId: "alice",
        message: "hello",
        source: "cli",
      },
      context,
    });

    expect(setup.turn.localInteractive).toBe(true);
    expect(setup.turn.runId).toBeDefined();
    expect(setup.turn.sessionId).toBe("room:alice");
    expect(setup.turn.connectionSource).toBe("cli");
    expect(setup.derivedTurnPolicy.useMultiStep).toBe(false);
    expect(setup.derivedTurnPolicy.maxIterations).toBeLessThanOrEqual(6);
    expect(setup.turnClassification.simpleChat).toBe(true);
    expect(setup.settingsBefore).toEqual({
      agent: {
        runDepth: "standard",
        maxIterations: 6,
        toolProgressMode: "all",
      },
    } as typeof setup.settingsBefore);
    expect(typeof setup.scheduleProfileObservation).toBe("function");
  });

  it("uses createProfileObservationScheduler to build the profile callback", async () => {
    const observedEvents: string[] = [];
    const context = createContext();
    const observeContext = {
      ...context,
      services: {
        ...context.services,
        userProfiles: {
          observe: async (userId: string, message: string) => {
            observedEvents.push(`${userId}:${message}`);
          },
        },
      },
    } as unknown as AgentExecutionContext;
    const setup = prepareNativeTurnSetup({
      input: {
        userId: "alice",
        message: "what is one plus one",
        source: "cli",
      },
      effectiveInput: {
        userId: "alice",
        message: "what is one plus one",
        source: "cli",
      },
      context: observeContext,
    });

    setup.scheduleProfileObservation();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0]).toBe(`alice:what is one plus one`);
  });
});
