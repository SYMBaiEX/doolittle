import { describe, expect, it } from "vitest";

import {
  applyRuntimeOverrides,
  isRecoverableNativePlanningError,
  shouldAttachSystemFacts,
} from "./chat-turn/core";

describe("chat turn core helpers", () => {
  it("merges runtime overrides without clobbering unspecified model settings", () => {
    expect(
      applyRuntimeOverrides(
        {
          model: {
            provider: "openai",
            model: "gpt-4.1",
            baseUrl: "https://example.com",
            temperature: 0.2,
            maxTokens: 4096,
          },
        } as Parameters<typeof applyRuntimeOverrides>[0],
        {
          model: "gpt-4.1-mini",
          temperature: 0.1,
        },
      ),
    ).toMatchObject({
      model: {
        provider: "openai",
        model: "gpt-4.1-mini",
        baseUrl: "https://example.com",
        temperature: 0.1,
        maxTokens: 4096,
      },
    });
  });

  it("recognizes recoverable native planning failures and system fact prompts", () => {
    expect(
      isRecoverableNativePlanningError(new Error("parse error in prompt")),
    ).toBe(true);
    expect(shouldAttachSystemFacts("what os am I on?")).toBe(true);
    expect(shouldAttachSystemFacts("/status")).toBe(false);
  });
});
