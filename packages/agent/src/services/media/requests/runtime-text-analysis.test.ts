import { ModelType } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { RuntimeMediaTextAnalysisPort } from "./runtime-text-analysis";

function createPort() {
  const useModel = vi.fn(async () => "runtime analysis");
  const port = new RuntimeMediaTextAnalysisPort(
    {} as never,
    {
      get: () => ({
        model: {
          provider: "openai",
          model: "gpt-4.1",
          baseUrl: "https://example.invalid/v1",
          temperature: 0.2,
          maxTokens: 256,
        },
      }),
    } as never,
  );
  port.bindRuntime({ getSetting: vi.fn(), useModel } as never);
  return { port, useModel };
}

describe("RuntimeMediaTextAnalysisPort", () => {
  it("uses the scoped TEXT_LARGE runtime port", async () => {
    const { port, useModel } = createPort();

    await expect(port.analyze("Analyze this media.")).resolves.toBe(
      "runtime analysis",
    );

    expect(useModel).toHaveBeenCalledWith(
      ModelType.TEXT_LARGE,
      expect.objectContaining({ prompt: "Analyze this media." }),
    );
  });

  it("preserves runtime failures", async () => {
    const { port, useModel } = createPort();
    const failure = new Error("model unavailable");
    useModel.mockRejectedValueOnce(failure);

    await expect(port.analyze("Analyze this media.")).rejects.toBe(failure);
  });

  it("rejects cancellation before calling the runtime", async () => {
    const { port, useModel } = createPort();
    const controller = new AbortController();
    controller.abort();

    await expect(
      port.analyze("Analyze this media.", { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(useModel).not.toHaveBeenCalled();
  });
});
