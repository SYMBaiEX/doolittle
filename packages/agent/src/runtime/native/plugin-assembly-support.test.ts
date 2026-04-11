import { describe, expect, it } from "bun:test";
import type { NativePluginDescriptor } from "@doolittle/contracts";
import { normalizeDelegationInput } from "./plugin-assembly-delegation";
import {
  buildNativePluginManagerSummary,
  describeNativeSpeechStatus,
} from "./plugin-assembly-support";

describe("normalizeDelegationInput", () => {
  it("normalizes metadata values to strings and keeps valid priorities", () => {
    const result = normalizeDelegationInput({
      priority: "high",
      metadata: {
        count: 2,
        active: true,
      },
      task: "sync",
    });

    expect(result.priority).toBe("high");
    expect(result.metadata).toEqual({ count: "2", active: "true" });
    expect(result.task).toBe("sync");
  });

  it("falls back to normal priority when the input is not recognized", () => {
    const result = normalizeDelegationInput({ priority: "urgent" });

    expect(result.priority).toBe("normal");
    expect(result.metadata).toBeUndefined();
  });
});

describe("buildNativePluginManagerSummary", () => {
  it("counts plugin classifications without mutating the catalog", () => {
    const catalog: NativePluginDescriptor[] = [
      {
        id: "one",
        packageName: "@example/one",
        category: "foundation",
        source: "official",
        kind: "adapter",
        maturity: "production",
        enabled: true,
        persistence: "none",
        notes: "",
      },
      {
        id: "two",
        packageName: "@example/two",
        category: "providers",
        source: "vendored",
        kind: "provider",
        maturity: "experimental",
        enabled: false,
        persistence: "injected",
        notes: "",
      },
    ];

    expect(buildNativePluginManagerSummary(catalog)).toEqual({
      total: 2,
      enabled: 1,
      official: 1,
      vendored: 1,
      providers: 1,
      adapters: 1,
      experimental: 1,
      placeholders: 0,
      injectedPersistence: 1,
      categories: 11,
    });
  });
});

describe("describeNativeSpeechStatus", () => {
  it("reports degraded readiness when no speech backend is configured", () => {
    expect(describeNativeSpeechStatus({} as never)).toEqual({
      ready: false,
      backend: null,
      mode: "degraded",
      configured: false,
      detail:
        "No mp3 speech backend is configured, so the plugin remains available in degraded SVG fallback mode.",
    });
  });

  it("prefers FAL when both speech backends are available", () => {
    expect(
      describeNativeSpeechStatus({
        falApiKey: "  fal-key  ",
        openAiApiKey: "openai-key",
      } as never),
    ).toEqual({
      ready: true,
      backend: "fal",
      mode: "active",
      configured: true,
      detail: "Speech generation is routed through the FAL-backed TTS path.",
    });
  });
});
