import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import { classifyTurnMessage } from "@/runtime/turn-classification";
import { buildInformationalResponseCacheKey } from "./chat-turn/cache";
import { createModelInputAssembly } from "./chat-turn/model-input";

function createModelInputContext() {
  return {
    runtime: {},
    services: {
      personalities: {
        getActive: () => ({
          id: "default-persona",
        }),
      },
      repository: {
        isRepository: () => true,
      },
      settings: {
        get: () => ({
          execution: {
            backend: "local-shell",
          },
          model: {
            provider: "openai",
            model: "gpt-4.1",
            baseUrl: "https://api.example.com/v1",
            temperature: 0.2,
            maxTokens: 2048,
          },
        }),
      },
    },
    config: {
      workspaceDir: "/workspace/demo",
    },
  } as unknown as AgentExecutionContext;
}

function createTurn(localInteractive = true) {
  return {
    sessionId: "session-1",
    localInteractive,
  } as unknown as Parameters<typeof createModelInputAssembly>[0]["turn"];
}

describe("chat turn model input seam", () => {
  it("assembles shared prelude sections for local coding turns", () => {
    const context = createModelInputContext();
    const message = "inspect the repo and explain what os I'm on";

    const assembly = createModelInputAssembly({
      context,
      turn: createTurn(),
      effectiveInput: {
        message,
      } as Parameters<typeof createModelInputAssembly>[0]["effectiveInput"],
      derivedTurnPolicy: {
        runDepth: "deep",
        maxIterations: 4,
        toolProgressMode: "all",
        useMultiStep: true,
      },
      turnClassification: classifyTurnMessage(message),
      settingsDuring: context.services.settings.get(),
    });
    const built = assembly.build();

    expect(assembly.capabilityProfile).toBe("coding");
    expect(assembly.requiresPreferredLocalIntentSynthesis).toBe(false);
    expect(built.messagePrelude).toContain("Live machine facts:");
    expect(built.messagePrelude).toContain("CAPABILITY PROFILE");
    expect(built.messagePrelude).toContain("profile=coding");
    expect(built.messagePrelude).toContain("CODING CONTEXT");
    expect(built.messagePrelude).toContain("cwd=/workspace/demo");
    expect(built.effectiveMessage).toEndWith(`User request:\n${message}`);
  });

  it("keeps cache eligibility and supports local synthesis prelude injection", () => {
    const context = createModelInputContext();
    const message = "what os am I on?";

    const assembly = createModelInputAssembly({
      context,
      turn: createTurn(),
      effectiveInput: {
        message,
      } as Parameters<typeof createModelInputAssembly>[0]["effectiveInput"],
      derivedTurnPolicy: {
        runDepth: "quick",
        maxIterations: 1,
        toolProgressMode: "all",
        useMultiStep: false,
      },
      turnClassification: classifyTurnMessage(message),
      settingsDuring: context.services.settings.get(),
      options: {
        personalityId: "reviewer",
      },
      preferredLocalIntent: {
        directLocalIntent: {
          label: "workspace:inspect",
        },
        requiresModelSynthesisForLocalIntent: () => true,
      },
    });
    const localSynthesisPrelude = [
      "Local workspace inspection already executed for this turn.",
      "repo is clean",
    ].join("\n");
    const built = assembly.build(localSynthesisPrelude);

    expect(assembly.requiresPreferredLocalIntentSynthesis).toBe(true);
    expect(assembly.responseCacheKey).toBe(
      buildInformationalResponseCacheKey({
        sessionId: "session-1",
        provider: "openai",
        model: "gpt-4.1",
        personalityId: "reviewer",
        message,
      }),
    );
    expect(built.messagePrelude).toContain(localSynthesisPrelude);
    expect(built.effectiveMessage).toContain(localSynthesisPrelude);
    expect(built.effectiveMessage).toEndWith(`User request:\n${message}`);
  });
});
