import { type IAgentRuntime, ModelType } from "@elizaos/core";
import { expect, it, vi } from "vitest";
import { createOfflineBootstrapTextModel } from "../../packages/plugins/doolittle-plugin/model-fallback";

it("keeps assembled prompts private when the selected provider is unavailable", async () => {
  const useModel = vi.fn().mockRejectedValue(new Error("offline"));
  const runtime = {
    getSetting: (key: string) =>
      key === "runtimeSettings"
        ? JSON.stringify({ model: { provider: "offline" } })
        : undefined,
    useModel,
  } as unknown as IAgentRuntime;
  const model = createOfflineBootstrapTextModel(ModelType.TEXT_LARGE);
  const prompt =
    "Private system instructions and user context must never appear in a recovery notice.";
  const response = await model(runtime, { prompt });
  expect(response).toContain("model provider is unavailable");
  expect(response).not.toContain(prompt);
  expect(response).not.toContain("Your message is still here");
  useModel.mockResolvedValue("The provider's actual answer.");
  expect(await model(runtime, { prompt })).toBe(
    "The provider's actual answer.",
  );
});
