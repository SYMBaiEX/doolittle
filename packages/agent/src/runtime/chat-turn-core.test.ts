import { describe, expect, it } from "bun:test";

import {
  applyRuntimeOverrides,
  buildInformationalResponseCacheKey,
  buildSimpleGreetingReply,
  isRecoverableNativePlanningError,
  shouldAttachSystemFacts,
  shouldUseInformationalResponseCache,
} from "./chat-turn/core";

describe("chat turn core helpers", () => {
  it("builds the expected simple greeting replies", () => {
    expect(buildSimpleGreetingReply("how are you today")).toBe(
      "Doing well. What do you want to work on?",
    );
    expect(buildSimpleGreetingReply("thanks")).toBe("Sure. What's next?");
    expect(buildSimpleGreetingReply("yo")).toBe(
      "Yo. What do you want to work on?",
    );
  });

  it("builds stable cache keys and normalizes message whitespace", () => {
    const keyA = buildInformationalResponseCacheKey({
      sessionId: "session-1",
      provider: "openai",
      model: "gpt-4.1",
      personalityId: "persona-a",
      message: "hello world",
    });
    const keyB = buildInformationalResponseCacheKey({
      sessionId: "session-1",
      provider: "openai",
      model: "gpt-4.1",
      personalityId: "persona-a",
      message: "  hello world  ",
    });

    expect(keyA).toBe(keyB);
    expect(
      buildInformationalResponseCacheKey({
        sessionId: "session-1",
        provider: "openai",
        model: "gpt-4.1",
        personalityId: "persona-b",
        message: "hello world",
      }),
    ).not.toBe(keyA);
  });

  it("flags informational local turns for cache reuse", () => {
    expect(
      shouldUseInformationalResponseCache({
        localInteractive: true,
        classification: {
          likelyLocalTask: false,
          requiresFullContext: false,
          informationalOnly: true,
          actionOriented: false,
        } as Parameters<
          typeof shouldUseInformationalResponseCache
        >[0]["classification"],
        policy: {
          useMultiStep: false,
          maxIterations: 1,
        } as Parameters<
          typeof shouldUseInformationalResponseCache
        >[0]["policy"],
      }),
    ).toBe(true);
  });

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
