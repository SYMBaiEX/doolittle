import { describe, expect, it } from "bun:test";

import {
  resolveDirectLocalIntent,
  shouldPreferDirectLocalExecution,
  shouldUseDirectLocalFallback,
} from "./local-intent-fallback";

describe("local intent fallback", () => {
  const fakeContext = {} as unknown as Parameters<
    typeof resolveDirectLocalIntent
  >[1];
  const fakeChatRequest = (message: string) =>
    ({ message }) as unknown as Parameters<
      typeof resolveDirectLocalIntent
    >[0] & {
      message: string;
      userId: string;
      roomId: string;
      source?: string;
    };

  it("marks repository and workspace intents as high-confidence", () => {
    const repoIntent = resolveDirectLocalIntent(
      fakeChatRequest("what changed in this repo?"),
      fakeContext,
    );
    const workspaceIntent = resolveDirectLocalIntent(
      fakeChatRequest("read file src/index.ts"),
      fakeContext,
    );

    expect(repoIntent?.isHighConfidence).toBe(true);
    expect(workspaceIntent?.isHighConfidence).toBe(true);
    expect(shouldPreferDirectLocalExecution(repoIntent)).toBe(true);
    expect(shouldPreferDirectLocalExecution(workspaceIntent)).toBe(true);
  });

  it("treats shell execution as non-high-confidence fallback", () => {
    const terminalIntent = resolveDirectLocalIntent(
      fakeChatRequest("run ls"),
      fakeContext,
    );

    expect(terminalIntent?.label.startsWith("shell:")).toBe(true);
    expect(shouldPreferDirectLocalExecution(terminalIntent)).toBe(false);
  });

  it("only triggers fallback for stalled native output", () => {
    expect(
      shouldUseDirectLocalFallback({
        message: "what changed in this repo?",
        response: "",
        observedActionCount: 0,
      }),
    ).toBe(true);

    expect(
      shouldUseDirectLocalFallback({
        message: "what changed in this repo?",
        response: "I'll search that now and get back to you.",
        observedActionCount: 0,
      }),
    ).toBe(true);

    expect(
      shouldUseDirectLocalFallback({
        message: "run ls",
        response: "I have a complete response with no tool call.",
        observedActionCount: 0,
      }),
    ).toBe(false);
  });

  it("can allow high-confidence fallback only when native has no actionable text", () => {
    expect(
      shouldUseDirectLocalFallback({
        message: "what changed in this repo?",
        response: "I am working now.",
        observedActionCount: 0,
        isHighConfidenceIntent: true,
      }),
    ).toBe(false);
  });

  it("allows stalled high-confidence local tasks to recover after one tool step", () => {
    expect(
      shouldUseDirectLocalFallback({
        message: "review the babylon repo locally",
        response: "",
        observedActionCount: 1,
        runFailureMessage: "dynamicPromptExecFromState failed",
        isHighConfidenceIntent: true,
      }),
    ).toBe(true);
  });
});
