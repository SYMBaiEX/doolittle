import { describe, expect, it, vi } from "vitest";
import type { EnvConfig } from "@/types";
import {
  discoverModelProviders,
  modelDiscoveryRequested,
  officialElizaCloudModels,
  parseCodexModelCache,
} from "./models";

function config(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    ollamaApiEndpoint: "http://127.0.0.1:11434/v1",
    ollamaLargeModel: "granite4.1:3b",
    ollamaSmallModel: "qwen3:1.7b",
    elizaCloudEnabled: false,
    elizaCloudBaseUrl: "https://api.elizaos.ai/v1",
    elizaCloudLargeModel: "anthropic/claude-sonnet-4.6",
    elizaCloudSmallModel: "anthropic/claude-haiku-4-5",
    openAiBaseUrl: "https://api.openai.com/v1",
    openAiModel: "gpt-5.4",
    anthropicBaseUrl: "https://api.anthropic.com/v1",
    anthropicLargeModel: "claude-sonnet-4.6",
    anthropicSmallModel: "claude-haiku-4.5",
    devinModel: "swe-1-6-fast",
    useLinkedCodexAuth: false,
    useLinkedClaudeCodeAuth: false,
    useLinkedDevinAuth: false,
    ...overrides,
  } as EnvConfig;
}

describe("runtime model discovery", () => {
  it("returns configured models without probing providers until requested", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const providers = await discoverModelProviders(
      config(),
      "codex",
      "gpt-5.6-sol",
      fetchImplementation,
      { codex: true },
      false,
    );

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(providers.find((provider) => provider.id === "codex")).toMatchObject(
      {
        ready: true,
        discovery: "configured",
      },
    );
    expect(
      providers.find((provider) => provider.id === "openai"),
    ).toMatchObject({
      ready: false,
      discovery: "unavailable",
    });
    expect(
      modelDiscoveryRequested(new URL("http://localhost/runtime/models")),
    ).toBe(true);
    expect(
      modelDiscoveryRequested(
        new URL("http://localhost/runtime/models?refresh=false"),
      ),
    ).toBe(false);
  });

  it("uses the official Eliza catalog for the immediate cloud model list", async () => {
    const official = officialElizaCloudModels();
    const providers = await discoverModelProviders(
      config({ elizaCloudEnabled: true }),
      "elizacloud",
      "anthropic/claude-sonnet-4.6",
      vi.fn<typeof fetch>(),
      { elizacloud: true },
      false,
    );
    const cloud = providers.find((provider) => provider.id === "elizacloud");

    expect(official.length).toBeGreaterThan(10);
    expect(new Set(official.map((model) => model.id)).size).toBe(
      official.length,
    );
    expect(cloud?.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "openai/gpt-5.5" }),
        expect.objectContaining({ id: "anthropic/claude-opus-4.7" }),
        expect.objectContaining({ id: "google/gemini-3.1-pro-preview" }),
      ]),
    );
  });

  it("recognizes an account-pool materialized API key without returning it", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "materialized-openai-key";
    try {
      const providers = await discoverModelProviders(
        config(),
        "openai",
        "gpt-5.4",
        vi.fn<typeof fetch>(),
        {},
        false,
      );
      const openai = providers.find((provider) => provider.id === "openai");
      expect(openai).toMatchObject({ ready: true, discovery: "configured" });
      expect(JSON.stringify(openai)).not.toContain("materialized-openai-key");
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });

  it("merges live provider models with configured fallbacks", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("11434")) {
        return Response.json({
          models: [
            { name: "granite4.1:3b", model: "granite4.1:3b" },
            { name: "qwen3:8b", model: "qwen3:8b" },
          ],
        });
      }
      if (url.includes("openai.com")) {
        return Response.json({
          data: [{ id: "gpt-5.4" }, { id: "gpt-5.4-mini" }, { id: "gpt-4o" }],
        });
      }
      return new Response("not found", { status: 404 });
    });

    const providers = await discoverModelProviders(
      config({ openAiApiKey: "test-key" }),
      "openai",
      "gpt-5.4",
      fetchImplementation,
    );

    expect(
      providers
        .find((provider) => provider.id === "ollama")
        ?.models.map((model) => model.id),
    ).toContain("qwen3:8b");
    expect(
      providers.find((provider) => provider.id === "ollama"),
    ).toMatchObject({
      discovery: "live",
      detail: "2 models discovered from the provider.",
    });
    expect(
      providers
        .find((provider) => provider.id === "openai")
        ?.models.map((model) => model.id),
    ).toContain("gpt-5.4-mini");
    expect(
      providers.find((provider) => provider.id === "openai")?.discovery,
    ).toBe("live");
    const openAiModels = providers.find(
      (provider) => provider.id === "openai",
    )?.models;
    expect(
      openAiModels?.find((model) => model.id === "gpt-5.4")?.reasoning,
    ).toMatchObject({ default: "medium" });
    expect(
      openAiModels?.find((model) => model.id === "gpt-4o")?.reasoning,
    ).toBeUndefined();
    expect(fetchImplementation).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/tags",
      expect.objectContaining({
        headers: expect.any(Headers),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: expect.any(Headers),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("keeps the current linked catalog when live discovery is unavailable", async () => {
    const providers = await discoverModelProviders(
      config({ useLinkedClaudeCodeAuth: true }),
      "claude-code",
      "claude-sonnet-5",
      vi.fn<typeof fetch>(async () => {
        throw new Error("offline");
      }),
    );
    const claude = providers.find((provider) => provider.id === "claude-code");

    expect(claude).toMatchObject({
      ready: true,
      discovery: "configured",
    });
    expect(claude?.models.map((model) => model.id)).toContain(
      "claude-sonnet-5",
    );
  });

  it("does not label a selected linked provider ready without usable auth", async () => {
    const providers = await discoverModelProviders(
      config(),
      "claude-code",
      "claude-sonnet-5",
      vi.fn<typeof fetch>(async () => {
        throw new Error("offline");
      }),
      { "claude-code": false },
    );

    expect(
      providers.find((provider) => provider.id === "claude-code"),
    ).toMatchObject({
      ready: false,
      discovery: "unavailable",
    });
  });

  it("offers the current ChatGPT, Codex, and Claude Code model catalogs", async () => {
    const providers = await discoverModelProviders(
      config({
        useLinkedCodexAuth: true,
        useLinkedClaudeCodeAuth: true,
      }),
      "codex",
      "gpt-5.6-sol",
      vi.fn<typeof fetch>(async () => {
        throw new Error("offline");
      }),
    );

    const codex = providers.find((provider) => provider.id === "codex");
    const claude = providers.find((provider) => provider.id === "claude-code");

    expect(codex?.label).toBe("ChatGPT / Codex");
    expect(codex?.models.map((model) => model.id)).toEqual(
      expect.arrayContaining(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]),
    );
    expect(claude?.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "claude-fable-5",
          label: "Claude Fable 5",
        }),
        expect.objectContaining({
          id: "claude-opus-5",
          label: "Claude Opus 5",
        }),
        expect.objectContaining({
          id: "claude-sonnet-5",
          label: "Claude Sonnet 5",
        }),
        expect.objectContaining({
          id: "claude-haiku-4-5",
          label: "Claude Haiku 4.5",
        }),
      ]),
    );
    for (const [id, defaultEffort, options] of [
      [
        "gpt-5.6-sol",
        "low",
        ["low", "medium", "high", "xhigh", "max", "ultra"],
      ],
      [
        "gpt-5.6-terra",
        "medium",
        ["low", "medium", "high", "xhigh", "max", "ultra"],
      ],
      ["gpt-5.6-luna", "medium", ["low", "medium", "high", "xhigh", "max"]],
    ] as const) {
      const reasoning = codex?.models.find(
        (model) => model.id === id,
      )?.reasoning;
      expect(reasoning?.default).toBe(defaultEffort);
      expect(reasoning?.options.map((option) => option.id)).toEqual(options);
    }
    for (const [id, defaultEffort] of [
      ["gpt-5.5", "medium"],
      ["gpt-5.4", "medium"],
      ["gpt-5.4-mini", "medium"],
      ["gpt-5.3-codex-spark", "high"],
    ] as const) {
      const reasoning = codex?.models.find(
        (model) => model.id === id,
      )?.reasoning;
      expect(reasoning?.default).toBe(defaultEffort);
      expect(reasoning?.options.map((option) => option.id)).toEqual([
        "low",
        "medium",
        "high",
        "xhigh",
      ]);
    }
    expect(
      claude?.models.find((model) => model.id === "claude-sonnet-5")?.reasoning,
    ).toMatchObject({ default: "high" });
    expect(
      claude?.models.find((model) => model.id === "claude-haiku-4-5")
        ?.reasoning,
    ).toBeUndefined();
  });

  it("preserves capability metadata from the linked Codex model cache", () => {
    expect(
      parseCodexModelCache({
        models: [
          {
            slug: "gpt-5.6-sol",
            display_name: "GPT-5.6 Sol",
            default_reasoning_level: "high",
            supported_reasoning_levels: [
              { effort: "low", description: "Fast" },
              { effort: "high", description: "Deep" },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        id: "gpt-5.6-sol",
        label: "GPT-5.6 Sol",
        reasoning: {
          default: "high",
          options: [
            { id: "low", label: "low", description: "Fast" },
            { id: "high", label: "high", description: "Deep" },
          ],
        },
      },
    ]);
  });

  it("does not advertise a Codex reasoning level the compatibility transport cannot send", () => {
    expect(
      parseCodexModelCache({
        models: [
          {
            slug: "gpt-5.6-sol",
            supported_reasoning_levels: [
              { effort: "minimal" },
              { effort: "max" },
              { effort: "ultra" },
            ],
          },
        ],
      }),
    ).toMatchObject([
      {
        reasoning: { options: [{ id: "max" }, { id: "ultra" }] },
      },
    ]);
  });

  it("uses Anthropic model-list headers without exposing credentials", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("anthropic-test");
      expect(headers.get("anthropic-version")).toBe("2023-06-01");
      return Response.json({
        data: [
          {
            id: "claude-sonnet-4.6",
            display_name: "Claude Sonnet 4.6",
          },
        ],
      });
    });

    const providers = await discoverModelProviders(
      config({ anthropicApiKey: "anthropic-test" }),
      "anthropic",
      "claude-sonnet-4.6",
      fetchImplementation,
    );

    expect(
      providers
        .find((provider) => provider.id === "anthropic")
        ?.models.find((model) => model.id === "claude-sonnet-4.6"),
    ).toMatchObject({
      label: "Claude Sonnet 4.6",
      source: "discovered",
    });
  });
});
