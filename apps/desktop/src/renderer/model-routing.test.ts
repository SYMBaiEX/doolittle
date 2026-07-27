import { describe, expect, it } from "bun:test";
import {
  defaultBaseUrlForProvider,
  defaultModelForProvider,
  providerReadiness,
} from "./model-routing";

describe("model-routing helpers", () => {
  it("preserves the current model when reselecting the active provider", () => {
    expect(defaultModelForProvider("ollama", "ollama", "granite4.1:8b")).toBe(
      "granite4.1:8b",
    );
  });

  it("falls back to provider defaults when switching providers", () => {
    expect(defaultModelForProvider("codex", "ollama", "granite4.1:3b")).toBe(
      "gpt-5-codex",
    );
    expect(defaultBaseUrlForProvider("openai", "ollama", "")).toBe(
      "https://api.openai.com/v1",
    );
  });

  it("derives linked provider readiness from account snapshots", () => {
    expect(
      providerReadiness("codex", {
        codex: { detail: "Linked", reusable: true },
      }),
    ).toEqual({
      detail: "Linked",
      ready: true,
      tone: "good",
    });

    expect(
      providerReadiness("claude-code", {
        claudeCode: { detail: "Login required" },
      }),
    ).toEqual({
      detail: "Login required",
      ready: false,
      tone: "warn",
    });
  });
});
