import { ShortcutRegistry } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import {
  hasProviderIndependentShortcut,
  type NativeProviderStageDependencies,
  runNativeProviderStage,
} from "./chat-turn/native/provider-stage";

function createInput() {
  return {
    input: {
      userId: "alice",
      message: "review this repository",
      source: "desktop",
    },
    effectiveInput: {
      userId: "alice",
      message: "review this repository",
      source: "desktop",
    },
    context: {
      runtime: {
        logger: {},
      },
    } as unknown as AgentExecutionContext,
    perf: {
      mark: vi.fn(),
      flush: vi.fn(),
    },
    turnSetup: {
      turn: {
        agentName: "Doolittle",
        localInteractive: true,
        connectionSource: "desktop",
        sessionId: "session-1",
        roomId: "room-1",
        worldId: "world-1",
        entityId: "entity-1",
        messageServerId: "server-1",
        settings: {
          agent: {
            runDepth: "standard",
            maxIterations: 8,
            toolProgressMode: "all",
          },
          model: {
            provider: "openai",
            model: "gpt-4.1",
          },
        },
        runId: "run-1",
      },
      scheduleProfileObservation: vi.fn(),
      messagePolicy: {
        runDepth: "standard",
        maxIterations: 8,
        toolProgressMode: "all",
        useMultiStep: true,
      },
      settingsBefore: {
        agent: {
          runDepth: "standard",
          maxIterations: 8,
          toolProgressMode: "all",
        },
        model: {
          provider: "openai",
          model: "gpt-4.1",
        },
      },
    },
    settingsDuring: {
      agent: {
        runDepth: "standard",
        maxIterations: 8,
        toolProgressMode: "all",
      },
      model: {
        provider: "openai",
        model: "gpt-4.1",
      },
    },
  } as unknown as Parameters<typeof runNativeProviderStage>[0];
}

function createDependencies(
  readinessMessage?: string,
): NativeProviderStageDependencies {
  return {
    hasProviderIndependentShortcut: vi.fn(() => false),
    getProviderReadinessMessage: vi.fn(async () => readinessMessage),
    handleReadyResponseTurn: vi.fn(
      async ({ readinessMessage: value }) => value,
    ),
    runProviderModelTurn: vi.fn(async () => ({
      handledMessage: true,
      response: "SDK response",
      messageId: "message-1",
      actionResults: [],
    })),
    runPostProviderTurn: vi.fn(
      async ({
        response,
      }: Parameters<
        NativeProviderStageDependencies["runPostProviderTurn"]
      >[0]) => ({
        kind: "final" as const,
        response,
        observedActionCount: 0,
        usedFallback: false,
      }),
    ),
  };
}

describe("ElizaOS-native provider stage", () => {
  it("detects registered explicit SDK shortcuts without custom command parsing", () => {
    const shortcutRegistry = new ShortcutRegistry();
    shortcutRegistry.register({
      id: "status",
      kind: "explicit",
      aliases: ["/status"],
      target: { kind: "action", name: "DOOLITTLE_COMMAND" },
      requiresAction: "DOOLITTLE_COMMAND",
    });
    const runtime = {
      actions: [{ name: "DOOLITTLE_COMMAND" }],
      shortcutRegistry,
    };

    expect(hasProviderIndependentShortcut(runtime as never, "/status")).toBe(
      true,
    );
    expect(
      hasProviderIndependentShortcut(runtime as never, "show status"),
    ).toBe(false);
  });

  it("passes the unmodified user turn and configured budget to the SDK seam", async () => {
    const input = createInput();
    const dependencies = createDependencies();

    const result = await runNativeProviderStage(input, dependencies);

    expect(result).toBe("SDK response");
    expect(dependencies.runProviderModelTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "alice",
        effectiveMessage: "review this repository",
        messagePolicy: input.turnSetup.messagePolicy,
      }),
    );
    expect(dependencies.runPostProviderTurn).toHaveBeenCalledTimes(1);
    expect(input.perf.mark).toHaveBeenCalledWith("native-handle-message");
  });

  it("keeps provider configuration readiness outside the model lifecycle", async () => {
    const dependencies = createDependencies("Provider needs configuration.");

    const result = await runNativeProviderStage(createInput(), dependencies);

    expect(result).toBe("Provider needs configuration.");
    expect(dependencies.runProviderModelTurn).not.toHaveBeenCalled();
    expect(dependencies.runPostProviderTurn).not.toHaveBeenCalled();
  });

  it("lets the SDK execute explicit shortcuts before provider readiness", async () => {
    const dependencies = createDependencies("Provider needs configuration.");
    vi.mocked(dependencies.hasProviderIndependentShortcut).mockReturnValue(
      true,
    );

    const result = await runNativeProviderStage(createInput(), dependencies);

    expect(result).toBe("SDK response");
    expect(dependencies.getProviderReadinessMessage).not.toHaveBeenCalled();
    expect(dependencies.handleReadyResponseTurn).toHaveBeenCalledWith(
      expect.objectContaining({ readinessMessage: undefined }),
    );
    expect(dependencies.runProviderModelTurn).toHaveBeenCalledTimes(1);
  });
});
