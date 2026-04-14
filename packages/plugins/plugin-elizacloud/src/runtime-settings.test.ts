import { describe, expect, it } from "bun:test";
import type { IAgentRuntime } from "@elizaos/core";
import { ModelType } from "@elizaos/core";
import {
  DEFAULT_ELIZA_CLOUD_BASE_URL,
  DEFAULT_ELIZA_CLOUD_MODEL,
  DEFAULT_ELIZA_CLOUD_SMALL_MODEL,
} from "./constants";
import {
  getRuntimeModelSettings,
  getRuntimeNumberSetting,
  getRuntimeProvider,
  getRuntimeStringSetting,
  isStructuredPlannerPrompt,
  resolveElizaCloudEmbeddingEndpoint,
  resolveElizaCloudEmbeddingModel,
  resolveElizaCloudModelSelection,
} from "./runtime-settings";

type RuntimeSettings = Record<string, string | null>;
type MockRuntime = Pick<IAgentRuntime, "getSetting">;

describe("runtimeSettings helpers", () => {
  it("reads provider from runtimeSettings JSON and handles invalid JSON", () => {
    const withProvider: MockRuntime = {
      getSetting: (key) =>
        key === "runtimeSettings"
          ? JSON.stringify({
              model: {
                provider: "elizacloud",
                model: "xai/grok-4.1-fast-reasoning",
              },
            })
          : null,
    };
    expect(getRuntimeProvider(withProvider as IAgentRuntime)).toBe(
      "elizacloud",
    );

    const invalid: MockRuntime = {
      getSetting: () => "not-json" as never,
    };
    expect(getRuntimeProvider(invalid as IAgentRuntime)).toBeUndefined();
    expect(getRuntimeModelSettings(invalid as IAgentRuntime)).toEqual({});
  });

  it("extracts runtime string and positive integer settings", () => {
    const runtime: MockRuntime = {
      getSetting: (key) => {
        const map: RuntimeSettings = {
          STR: "  value-with-whitespace  ",
          BAD_STR: "   ",
          DIM: "1536",
          DIM_NEG: "-3",
          DIM_FLOAT: "12.7",
          DIM_TEXT: "x",
        };
        return map[key as keyof RuntimeSettings] ?? null;
      },
    };

    expect(getRuntimeStringSetting(runtime as IAgentRuntime, "STR")).toBe(
      "value-with-whitespace",
    );
    expect(
      getRuntimeStringSetting(runtime as IAgentRuntime, "BAD_STR"),
    ).toBeUndefined();
    expect(getRuntimeNumberSetting(runtime as IAgentRuntime, "DIM")).toBe(1536);
    expect(
      getRuntimeNumberSetting(runtime as IAgentRuntime, "DIM_NEG"),
    ).toBeUndefined();
    expect(getRuntimeNumberSetting(runtime as IAgentRuntime, "DIM_FLOAT")).toBe(
      12,
    );
    expect(
      getRuntimeNumberSetting(runtime as IAgentRuntime, "DIM_TEXT"),
    ).toBeUndefined();
  });

  it("resolves embedding endpoint with /embeddings normalization", () => {
    const runtime: MockRuntime = {
      getSetting: (key) =>
        key === "ELIZAOS_CLOUD_EMBEDDING_URL"
          ? "https://www.elizacloud.ai/api/v1/embeddings"
          : null,
    };
    expect(resolveElizaCloudEmbeddingEndpoint(runtime as IAgentRuntime)).toBe(
      "https://www.elizacloud.ai/api/v1/embeddings",
    );

    const runtimeWithoutConfigured: MockRuntime = {
      getSetting: (key) => {
        if (key === "runtimeSettings") {
          return JSON.stringify({
            model: { baseUrl: `${DEFAULT_ELIZA_CLOUD_BASE_URL}/` },
          });
        }
        return null;
      },
    };
    expect(
      resolveElizaCloudEmbeddingEndpoint(
        runtimeWithoutConfigured as IAgentRuntime,
      ),
    ).toBe(`${DEFAULT_ELIZA_CLOUD_BASE_URL}/embeddings`);
  });

  it("resolves embedding model with fallback defaults", () => {
    const runtime: MockRuntime = {
      getSetting: (key) =>
        key === "ELIZAOS_CLOUD_EMBEDDING_MODEL" ? null : null,
    };
    expect(resolveElizaCloudEmbeddingModel(runtime as IAgentRuntime)).toBe(
      "openai/text-embedding-3-small",
    );
  });

  it("selects model based on planner detection and requested model type", () => {
    const runtime: MockRuntime = {
      getSetting: (key) => {
        if (key === "runtimeSettings") {
          return JSON.stringify({
            model: {
              provider: "elizacloud",
              model: "runtime-large",
              baseUrl: DEFAULT_ELIZA_CLOUD_BASE_URL,
            },
          });
        }
        if (key === "ELIZAOS_CLOUD_SMALL_MODEL") {
          return "runtime-small";
        }
        if (key === "ELIZAOS_CLOUD_LARGE_MODEL") {
          return "legacy-large";
        }
        return null;
      },
    };

    expect(
      resolveElizaCloudModelSelection(
        runtime as IAgentRuntime,
        ModelType.TEXT_SMALL,
        '{"thought":"ok","providers":[],"action":"respond","params":{},"isFinish":true}',
      ),
    ).toBe("runtime-large");
    expect(
      resolveElizaCloudModelSelection(
        runtime as IAgentRuntime,
        ModelType.TEXT_SMALL,
        "short normal prompt",
      ),
    ).toBe("runtime-small");
    expect(
      resolveElizaCloudModelSelection(
        runtime as IAgentRuntime,
        ModelType.TEXT_COMPLETION,
        "short normal prompt",
      ),
    ).toBe("runtime-large");
  });

  it("falls back to defaults when model settings are absent", () => {
    const runtime: MockRuntime = {
      getSetting: () => null,
    };

    expect(
      resolveElizaCloudModelSelection(
        runtime as IAgentRuntime,
        ModelType.TEXT_SMALL,
        "hi",
      ),
    ).toBe(DEFAULT_ELIZA_CLOUD_SMALL_MODEL);
    expect(
      resolveElizaCloudModelSelection(
        runtime as IAgentRuntime,
        ModelType.TEXT_LARGE,
        "hi",
      ),
    ).toBe(DEFAULT_ELIZA_CLOUD_MODEL);
  });

  it("detects structured planner prompts", () => {
    expect(
      isStructuredPlannerPrompt(
        'Return valid JSON schema with keys "thought", "providers", "action", "params", and "isFinish".',
      ),
    ).toBe(true);
    expect(isStructuredPlannerPrompt("just a normal text message")).toBe(false);
  });
});
