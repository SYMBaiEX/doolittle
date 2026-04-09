import { describe, expect, it } from "bun:test";

import {
  buildOfflineMediaTextResponse,
  chooseMediaTextBackend,
} from "./backends";

describe("media request backends", () => {
  it("chooses the expected text backend and offline fallback", () => {
    expect(chooseMediaTextBackend(undefined)).toBe("offline");
    expect(
      chooseMediaTextBackend({
        provider: "openai",
        model: "gpt-4.1-mini",
        baseUrl: "https://example.invalid/v1",
        temperature: 0.2,
        maxTokens: 128,
      }),
    ).toBe("offline");
    expect(
      chooseMediaTextBackend({
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseUrl: "https://example.invalid",
        temperature: 0.2,
        maxTokens: 128,
        anthropicApiKey: "test-key",
      }),
    ).toBe("anthropic");

    const fallback = buildOfflineMediaTextResponse("Prompt text", {
      focus: "voice",
      inspection: {
        kind: "audio",
        textPreview: "Preview text",
        transcriptPreview: "Transcript preview",
        captionPreview: "Caption preview",
      } as never,
      signals: ["Kind: audio", "Exists: true"],
    });
    expect(fallback).toContain("Offline analysis for voice.");
    expect(fallback).toContain("Signals: Kind: audio; Exists: true");
    expect(fallback).toContain("Prompt text");
  });
});
