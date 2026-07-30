import { ModelType } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import { runModelAnalysis } from "./model-analysis";

function createContext() {
  const storeMessage = vi.fn();
  const createMemory = vi.fn();
  const handleMessage = vi.fn();
  const startTurn = vi.fn();
  const finishTurn = vi.fn();
  const getSetting = vi.fn(() => undefined);
  const useModel = vi.fn(async (modelType: unknown) => {
    expect(modelType).toBe(ModelType.TEXT_LARGE);
    return "model-only result";
  });
  const context = {
    config: { workspaceDir: "/workspace/demo" },
    runtime: {
      getSetting,
      useModel,
      createMemory,
      messageService: { handleMessage },
    },
    services: {
      settings: {
        get: () => ({
          agent: {
            runDepth: "standard",
            maxIterations: 4,
            toolProgressMode: "compact",
          },
          model: {
            provider: "openai",
            model: "gpt-4.1",
            baseUrl: "https://api.openai.com/v1",
            temperature: 0.2,
            maxTokens: 1024,
          },
        }),
      },
      sessions: { storeMessage },
      runController: { startTurn, finishTurn },
    },
  } as unknown as AgentExecutionContext;

  return {
    context,
    createMemory,
    finishTurn,
    handleMessage,
    startTurn,
    storeMessage,
    useModel,
  };
}

describe("runModelAnalysis", () => {
  it("uses one scoped Eliza model call without creating chat lifecycle state", async () => {
    const harness = createContext();

    await expect(
      runModelAnalysis(harness.context, "Analyze this browser capture.", {
        label: "browser",
        personalityId: "primary",
      }),
    ).resolves.toBe("model-only result");

    expect(harness.useModel).toHaveBeenCalledTimes(1);
    expect(harness.useModel).toHaveBeenCalledWith(
      ModelType.TEXT_LARGE,
      expect.objectContaining({ prompt: "Analyze this browser capture." }),
    );
    expect(harness.createMemory).not.toHaveBeenCalled();
    expect(harness.handleMessage).not.toHaveBeenCalled();
    expect(harness.storeMessage).not.toHaveBeenCalled();
    expect(harness.startTurn).not.toHaveBeenCalled();
    expect(harness.finishTurn).not.toHaveBeenCalled();
  });

  it("preserves model failures instead of converting them into a chat reply", async () => {
    const harness = createContext();
    const failure = new Error("provider unavailable");
    harness.useModel.mockRejectedValueOnce(failure);

    await expect(
      runModelAnalysis(harness.context, "Analyze this browser capture.", {
        label: "browser",
      }),
    ).rejects.toBe(failure);

    expect(harness.createMemory).not.toHaveBeenCalled();
    expect(harness.handleMessage).not.toHaveBeenCalled();
    expect(harness.storeMessage).not.toHaveBeenCalled();
    expect(harness.startTurn).not.toHaveBeenCalled();
  });

  it("rejects an already-cancelled request before invoking the model", async () => {
    const harness = createContext();
    const controller = new AbortController();
    controller.abort();

    await expect(
      runModelAnalysis(harness.context, "Analyze this browser capture.", {
        label: "browser",
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(harness.useModel).not.toHaveBeenCalled();
    expect(harness.createMemory).not.toHaveBeenCalled();
    expect(harness.storeMessage).not.toHaveBeenCalled();
    expect(harness.startTurn).not.toHaveBeenCalled();
  });

  it("passes an in-flight abort signal to the model and preserves its AbortError", async () => {
    const harness = createContext();
    const controller = new AbortController();
    const abortError = new Error("provider request aborted");
    abortError.name = "AbortError";
    harness.useModel.mockRejectedValueOnce(abortError);

    await expect(
      runModelAnalysis(harness.context, "Analyze this browser capture.", {
        label: "browser",
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(abortError);

    expect(harness.useModel).toHaveBeenCalledWith(
      ModelType.TEXT_LARGE,
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(harness.createMemory).not.toHaveBeenCalled();
    expect(harness.storeMessage).not.toHaveBeenCalled();
  });

  it("reports cancellation when the request aborts after the model resolves", async () => {
    const harness = createContext();
    const controller = new AbortController();
    harness.useModel.mockImplementationOnce(async () => {
      controller.abort();
      return "late result";
    });

    await expect(
      runModelAnalysis(harness.context, "Analyze this browser capture.", {
        label: "browser",
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(harness.createMemory).not.toHaveBeenCalled();
    expect(harness.storeMessage).not.toHaveBeenCalled();
    expect(harness.startTurn).not.toHaveBeenCalled();
  });
});
