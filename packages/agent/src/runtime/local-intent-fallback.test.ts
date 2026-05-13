import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  requiresModelSynthesisForLocalIntent,
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

  it("routes overview intents through local inspection before model synthesis", () => {
    const overviewIntent = resolveDirectLocalIntent(
      fakeChatRequest("Give me a breakdown of this repo"),
      fakeContext,
    );

    expect(overviewIntent?.isHighConfidence).toBe(true);
    expect(requiresModelSynthesisForLocalIntent(overviewIntent)).toBe(true);
  });

  it("treats shell execution as non-high-confidence fallback", () => {
    const terminalIntent = resolveDirectLocalIntent(
      fakeChatRequest("run ls"),
      fakeContext,
    );

    expect(terminalIntent?.label.startsWith("shell:")).toBe(true);
    expect(shouldPreferDirectLocalExecution(terminalIntent)).toBe(false);
  });

  it("scaffolds a requested static site inside an account-relative dev root", async () => {
    const parent = join(tmpdir(), `doolittle-site-${Date.now()}`);
    const home = join(parent, "symbiex");
    const dev = join(home, "dev");
    mkdirSync(dev, { recursive: true });

    const previousHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const intent = resolveDirectLocalIntent(
        fakeChatRequest(
          "Can you make a new directory in the symbiex/dev named the-effect and make a html file with css and js that is a simple website that explains who you are.",
        ),
        { config: { workspaceDir: dev } } as never,
      );

      expect(intent?.label).toStartWith("workspace:scaffold-static-site:");
      expect(intent?.isHighConfidence).toBe(true);

      const response = await intent?.execute();
      const target = join(dev, "the-effect");
      expect(response).toContain(target);
      expect(existsSync(join(target, "index.html"))).toBe(true);
      expect(existsSync(join(target, "styles.css"))).toBe(true);
      expect(existsSync(join(target, "script.js"))).toBe(true);
      expect(readFileSync(join(target, "index.html"), "utf8")).toContain(
        "Doolittle",
      );
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      rmSync(parent, { recursive: true, force: true });
    }
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

  it("does not skip directly to deterministic fallback for synthesis intents without a runtime failure", () => {
    expect(
      shouldUseDirectLocalFallback({
        message: "Give me a breakdown of this repo",
        response: "",
        observedActionCount: 0,
        isHighConfidenceIntent: true,
        requiresModelSynthesis: true,
      }),
    ).toBe(false);
  });

  it("treats meta repo-review recap output as an incomplete local review", () => {
    expect(
      shouldUseDirectLocalFallback({
        message: "Give me a breakdown of this repo",
        response:
          "I searched the local workspace.\n\nWhat was completed:\n- confirmed the repo\n\nWhat was not completed:\n- deeper repo inspection did not finish\n\nIf you want, I can now do the actual repo review.",
        observedActionCount: 0,
        isHighConfidenceIntent: true,
      }),
    ).toBe(true);
  });
});
