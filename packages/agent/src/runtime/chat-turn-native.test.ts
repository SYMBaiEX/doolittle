import { describe, expect, it } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import {
  prepareNativeTurnSetup,
  runNativeMessageTurn,
} from "./chat-turn/native";

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
          model: {
            provider: "ollama",
            model: "granite4.1:3b",
          },
        }),
      },
      userProfiles: {
        observe: async () => undefined,
        get: () => ({
          userId: "alice",
          preferences: [],
          facts: [],
          beliefs: [],
          beliefSources: [],
          notes: [],
          aliases: [],
          goals: [],
          projectContext: [],
          constraints: [],
          explicitMemories: [],
          toolPreferences: [],
          workStyle: [],
          lastSeenAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        recall: () => [],
      },
      memory: {
        list: () => [],
        summary: (target: "memory" | "user") => ({
          target,
          entries: 0,
          characters: 0,
          preview: [],
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
        finishTurn: () => undefined,
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
      model: {
        provider: "ollama",
        model: "granite4.1:3b",
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

  it("uses a small direct model path for informational local chat turns", async () => {
    const modelCalls: Array<unknown> = [];
    const storedMessages: Array<{ role: string; text: string }> = [];
    const context = {
      ...createContext(),
      runtime: {
        character: {
          name: "Doolittle",
        },
        useModel: async (_modelType: string, params: unknown) => {
          modelCalls.push(params);
          return "Doolittle: I am Doolittle. I can chat, reason about the repo, and help with terminal work.";
        },
      },
    } as unknown as AgentExecutionContext;
    (context.services.sessions.storeMessage as unknown as (message: {
      role: string;
      text: string;
    }) => void) = (message) => {
      storedMessages.push({ role: message.role, text: message.text });
    };

    const turnSetup = prepareNativeTurnSetup({
      input: {
        userId: "alice",
        message: "what is your name?",
        source: "cli",
      },
      effectiveInput: {
        userId: "alice",
        message: "what is your name?",
        source: "cli",
      },
      context,
    });
    const result = await runNativeMessageTurn({
      input: {
        userId: "alice",
        message: "what is your name?",
        source: "cli",
      },
      effectiveInput: {
        userId: "alice",
        message: "what is your name?",
        source: "cli",
      },
      context,
      perf: {
        mark: () => undefined,
        flush: () => undefined,
      },
      turnSetup,
      settingsDuring: turnSetup.settingsBefore,
    });

    expect(result).toBe(
      "I am Doolittle. I can chat, reason about the repo, and help with terminal work.",
    );
    expect(modelCalls).toHaveLength(1);
    expect(modelCalls[0]).toMatchObject({
      maxTokens: 96,
      temperature: 0.35,
    });
    expect((modelCalls[0] as { prompt: string }).prompt).toContain(
      "present conversational partner",
    );
    expect((modelCalls[0] as { prompt: string }).prompt).toContain(
      "Do not lead with 'I do not experience'",
    );
    expect(storedMessages.at(-1)).toEqual({
      role: "assistant",
      text: result,
    });
  });

  it("routes simple greetings through the model instead of a canned shortcut", async () => {
    const modelCalls: Array<unknown> = [];
    const storedMessages: Array<{ role: string; text: string }> = [];
    const context = {
      ...createContext(),
      runtime: {
        character: {
          name: "Doolittle",
        },
        useModel: async (_modelType: string, params: unknown) => {
          modelCalls.push(params);
          return "Doolittle: Hey, I'm here with you. How's the night treating the workspace?";
        },
      },
    } as unknown as AgentExecutionContext;
    (context.services.sessions.storeMessage as unknown as (message: {
      role: string;
      text: string;
    }) => void) = (message) => {
      storedMessages.push({ role: message.role, text: message.text });
    };

    const request = {
      userId: "alice",
      message: "Hey there!",
      source: "cli",
    } as const;
    const turnSetup = prepareNativeTurnSetup({
      input: request,
      effectiveInput: request,
      context,
    });
    const result = await runNativeMessageTurn({
      input: request,
      effectiveInput: request,
      context,
      perf: {
        mark: () => undefined,
        flush: () => undefined,
      },
      turnSetup,
      settingsDuring: turnSetup.settingsBefore,
    });

    expect(result).toBe(
      "Hey, I'm here with you. How's the night treating the workspace?",
    );
    expect(modelCalls).toHaveLength(1);
    expect(modelCalls[0]).toMatchObject({
      maxTokens: 96,
      temperature: 0.35,
    });
    expect((modelCalls[0] as { prompt: string }).prompt).toContain(
      "present conversational partner",
    );
    expect(storedMessages.at(-1)).toEqual({
      role: "assistant",
      text: result,
    });
  });

  it("keeps informational architecture questions out of the action planner", async () => {
    const modelCalls: Array<unknown> = [];
    const context = {
      ...createContext(),
      runtime: {
        character: {
          name: "Doolittle",
        },
        useModel: async (_modelType: string, params: unknown) => {
          modelCalls.push(params);
          return "Doolittle is an ElizaOS-native TypeScript operator harness with a local CLI, API, scheduler, plugins, memory, and tool services.";
        },
      },
    } as unknown as AgentExecutionContext;

    const request = {
      userId: "alice",
      message: "What can you tell me about the doolittle architecture?",
      source: "cli",
    } as const;
    const turnSetup = prepareNativeTurnSetup({
      input: request,
      effectiveInput: request,
      context,
    });
    const result = await runNativeMessageTurn({
      input: request,
      effectiveInput: request,
      context,
      perf: {
        mark: () => undefined,
        flush: () => undefined,
      },
      turnSetup,
      settingsDuring: turnSetup.settingsBefore,
    });

    expect(result).toBe(
      "Doolittle is an ElizaOS-native TypeScript operator harness with a local CLI, API, scheduler, plugins, memory, and tool services.",
    );
    expect(modelCalls).toHaveLength(1);
    expect(modelCalls[0]).toMatchObject({
      maxTokens: 192,
    });
    expect((modelCalls[0] as { prompt: string }).prompt).toContain(
      "Runtime facts for technical/capability questions only",
    );
  });

  it("routes saved user-name recall through the model with profile memory context", async () => {
    const modelCalls: Array<unknown> = [];
    const context = {
      ...createContext(),
      runtime: {
        character: {
          name: "Doolittle",
        },
        useModel: async (_modelType: string, params: unknown) => {
          modelCalls.push(params);
          return "Doolittle: Yes - I have you saved as Alex.";
        },
      },
      services: {
        ...createContext().services,
        userProfiles: {
          observe: async () => undefined,
          get: (userId: string) => ({
            userId,
            displayName: "Alex",
            preferences: [],
            facts: [],
            beliefs: [],
            beliefSources: [],
            notes: [],
            aliases: [],
            goals: [],
            projectContext: [],
            constraints: [],
            explicitMemories: [],
            toolPreferences: [],
            workStyle: [],
            lastSeenAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
          recall: () => [],
        },
        memory: {
          list: () => [],
          summary: (target: "memory" | "user") => ({
            target,
            entries: 0,
            characters: 0,
            preview: [],
          }),
        },
      },
    } as unknown as AgentExecutionContext;

    const request = {
      userId: "alice",
      message: "What is my name then?",
      source: "cli",
    } as const;
    const turnSetup = prepareNativeTurnSetup({
      input: request,
      effectiveInput: request,
      context,
    });
    const result = await runNativeMessageTurn({
      input: request,
      effectiveInput: request,
      context,
      perf: {
        mark: () => undefined,
        flush: () => undefined,
      },
      turnSetup,
      settingsDuring: turnSetup.settingsBefore,
    });

    expect(result).toBe("Yes - I have you saved as Alex.");
    expect(modelCalls).toHaveLength(1);
    expect((modelCalls[0] as { prompt: string }).prompt).toContain(
      "savedDisplayName=Alex",
    );
    expect((modelCalls[0] as { prompt: string }).prompt).toContain(
      "Do not infer a name",
    );
  });

  it("routes memory status through the model with store-derived context", async () => {
    const modelCalls: Array<unknown> = [];
    const context = {
      ...createContext(),
      runtime: {
        character: {
          name: "Doolittle",
        },
        useModel: async (_modelType: string, params: unknown) => {
          modelCalls.push(params);
          return "Doolittle: Memory is available. I can see two shared entries, one user entry, and profile facts like Alabama; no saved display name yet.";
        },
      },
      services: {
        ...createContext().services,
        userProfiles: {
          observe: async () => undefined,
          get: (userId: string) => ({
            userId,
            preferences: ["prefers Bun"],
            facts: ["lives in Alabama"],
            beliefs: [],
            beliefSources: [],
            notes: [],
            aliases: [],
            goals: [],
            projectContext: [],
            constraints: [],
            explicitMemories: ["likes terminal-native agents"],
            toolPreferences: [],
            workStyle: [],
            lastSeenAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
          recall: () => [],
        },
        memory: {
          list: () => [],
          summary: (target: "memory" | "user") => ({
            target,
            entries: target === "memory" ? 2 : 1,
            characters: 42,
            preview: [],
          }),
        },
      },
    } as unknown as AgentExecutionContext;

    const request = {
      userId: "alice",
      message: "Your long term memory?",
      source: "cli",
    } as const;
    const turnSetup = prepareNativeTurnSetup({
      input: request,
      effectiveInput: request,
      context,
    });
    const result = await runNativeMessageTurn({
      input: request,
      effectiveInput: request,
      context,
      perf: {
        mark: () => undefined,
        flush: () => undefined,
      },
      turnSetup,
      settingsDuring: turnSetup.settingsBefore,
    });

    expect(result).toContain("Memory is available");
    expect(result).toContain("two shared entries");
    expect(result).toContain("no saved display name yet");
    expect(result).not.toContain("permission");
    expect(modelCalls).toHaveLength(1);
    expect((modelCalls[0] as { prompt: string }).prompt).toContain(
      "sharedMemoryEntries=2",
    );
    expect((modelCalls[0] as { prompt: string }).prompt).toContain(
      "userMemoryEntries=1",
    );
    expect((modelCalls[0] as { prompt: string }).prompt).toContain(
      "facts=lives in Alabama",
    );
  });
});
