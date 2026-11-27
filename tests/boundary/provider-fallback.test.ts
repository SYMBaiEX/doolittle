import { type IAgentRuntime, ModelType } from "@elizaos/core";
import { expect, it, vi } from "vitest";
import { createOfflineBootstrapTextModel } from "../../packages/plugins/doolittle-plugin/model-fallback";
import {
  probeOllamaModel,
  resolveOllamaTagsUrl,
} from "../../packages/plugins/provider-transport/src";

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

it("resolves and probes the same Ollama catalog for native and compatibility URLs", async () => {
  const fetchImpl = vi.fn(async () =>
    Response.json({ models: [{ name: "granite:latest" }] }),
  );
  const endpoint = "https://example.org/proxy/ollama/v1/models?debug=1#section";
  expect(resolveOllamaTagsUrl(endpoint)).toBe(
    "https://example.org/proxy/ollama/api/tags",
  );
  await expect(
    probeOllamaModel(endpoint, "granite", fetchImpl as typeof fetch),
  ).resolves.toEqual({ state: "ready" });
  expect(fetchImpl).toHaveBeenCalledOnce();
  await expect(
    probeOllamaModel(
      "file:///tmp/ollama",
      "granite",
      fetchImpl as typeof fetch,
    ),
  ).resolves.toEqual({ state: "invalid_endpoint" });
  expect(fetchImpl).toHaveBeenCalledOnce();
});

it("reuses fresh ready Ollama probes without caching failures", async () => {
  const fetchImpl = vi.fn(async () =>
    Response.json({ models: [{ name: "granite:latest" }] }),
  );
  fetchImpl.mockRejectedValueOnce(new Error("down"));
  const endpoint = "https://example.org/ready-probe-cache/v1";

  await expect(
    probeOllamaModel(endpoint, "granite", fetchImpl as typeof fetch),
  ).resolves.toEqual({ state: "unreachable" });
  await expect(
    probeOllamaModel(endpoint, "granite", fetchImpl as typeof fetch),
  ).resolves.toEqual({ state: "ready" });
  expect(fetchImpl).toHaveBeenCalledTimes(2);

  await expect(
    probeOllamaModel(endpoint, "granite", fetchImpl as typeof fetch),
  ).resolves.toEqual({ state: "ready" });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
