import {
  type IAgentRuntime,
  ModelType,
  NoModelProviderConfiguredError,
} from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withOllamaEmbeddingReadiness } from "./ollama-embedding-readiness";

const config = {
  ollamaApiEndpoint: "http://127.0.0.1:11434/api",
  ollamaEmbeddingModel: "nomic-embed-text:latest",
};

function setup() {
  const embedding = vi.fn().mockResolvedValue([0.1, 0.2]);
  const text = vi.fn().mockResolvedValue("hello");
  const plugin = withOllamaEmbeddingReadiness(
    {
      name: "ollama",
      description: "Official provider fixture",
      models: {
        [ModelType.TEXT_EMBEDDING]: embedding,
        [ModelType.TEXT_LARGE]: text,
      },
    },
    config,
  );
  const fetch = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ models: [{ name: "nomic-embed-text" }] }),
        ),
    );
  const runtime = {
    fetch,
    getSetting: vi.fn(),
    adapter: { ensureEmbeddingDimension: vi.fn().mockResolvedValue(undefined) },
  } as unknown as IAgentRuntime;
  const invoke = plugin.models?.[ModelType.TEXT_EMBEDDING];
  if (!invoke) throw new Error("Missing embedding handler");
  return { embedding, plugin, runtime, fetch, invoke, text };
}

afterEach(() => vi.restoreAllMocks());

describe("Ollama embedding startup readiness", () => {
  it("keeps the CLI bootable via the SDK unavailable-provider path without fake vectors", async () => {
    const { fetch, invoke, runtime, embedding } = setup();
    fetch.mockRejectedValue(new TypeError("fetch failed secret server detail"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(invoke(runtime, null)).rejects.toBeInstanceOf(
      NoModelProviderConfiguredError,
    );
    await expect(invoke(runtime, null)).rejects.toThrow("ollama serve");
    expect(embedding).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
    expect(warning.mock.calls[0]?.[0]).not.toContain("secret");
    expect(fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not auto-download a missing embedding model during startup", async () => {
    const { fetch, invoke, runtime, embedding } = setup();
    fetch.mockResolvedValue(new Response(JSON.stringify({ models: [] })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(invoke(runtime, null)).rejects.toThrow(
      "ollama pull nomic-embed-text:latest",
    );
    expect(embedding).not.toHaveBeenCalled();
  });

  it("uses the configured endpoint and original SDK handler when available", async () => {
    const { invoke, runtime, fetch, embedding, plugin, text } = setup();
    vi.mocked(runtime.getSetting).mockImplementation((key) =>
      key === "OLLAMA_API_ENDPOINT" ? "http://localhost:1234/proxy/api/" : null,
    );
    await expect(invoke(runtime, null)).resolves.toEqual([0.1, 0.2]);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:1234/proxy/api/tags",
      expect.any(Object),
    );
    expect(embedding).toHaveBeenCalledWith(runtime, null);
    expect(plugin.models?.[ModelType.TEXT_LARGE]).toBe(text);
  });

  it("recovers vector dimensions through the SDK before resuming semantic memory", async () => {
    const { invoke, runtime, fetch, embedding } = setup();
    fetch.mockRejectedValueOnce(new TypeError("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(invoke(runtime, null)).rejects.toBeInstanceOf(
      NoModelProviderConfiguredError,
    );
    await expect(invoke(runtime, { text: "real document" })).resolves.toEqual([
      0.1, 0.2,
    ]);
    expect(runtime.adapter.ensureEmbeddingDimension).toHaveBeenCalledWith(2);
    expect(embedding.mock.calls.map((call) => call[1])).toEqual([
      { text: "real document" },
    ]);
  });

  it("preserves ordinary embedding errors rather than claiming success", async () => {
    const { invoke, runtime, embedding } = setup();
    const failure = new Error("provider rejected document");
    embedding.mockRejectedValue(failure);
    await expect(invoke(runtime, { text: "real document" })).rejects.toBe(
      failure,
    );
  });

  it("converts a failed initialization probe to actionable degraded startup", async () => {
    const { invoke, runtime, embedding } = setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    embedding.mockRejectedValue(new Error("API retry failed"));
    await expect(invoke(runtime, null)).rejects.toThrow("Check `ollama list`");
  });
});
