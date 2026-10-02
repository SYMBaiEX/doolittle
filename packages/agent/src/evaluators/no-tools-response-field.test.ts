import {
  ChannelType,
  type ResponseHandlerFieldContext,
  ResponseHandlerFieldRegistry,
} from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { noToolsResponseField } from "./no-tools-response-field";

function context(
  text = "Do not run commands or use tools. Propose a two-step plan.",
  channelType: ChannelType = ChannelType.DM,
): ResponseHandlerFieldContext {
  return {
    runtime: { logger: { warn: vi.fn() } } as never,
    message: { content: { text, channelType } } as never,
    state: {} as never,
    senderRole: "OWNER",
    turnSignal: new AbortController().signal,
  };
}

describe("native tool-free Stage-1 response field", () => {
  it("includes its prompt instruction only for explicit direct-text tool bans", async () => {
    const registry = new ResponseHandlerFieldRegistry();
    registry.register(noToolsResponseField);
    const schema = registry.composeSchema();

    const active = await registry.composePromptSlices(context());
    expect(active.activeFieldNames).toContain("doolittleToolFreeReply");
    expect(active.rendered).toContain("COMPLETE final answer");
    const ordinary = await registry.composePromptSlices(
      context("Inspect the repo."),
    );
    expect(ordinary.activeFieldNames).not.toContain("doolittleToolFreeReply");
    expect(ordinary.rendered).not.toContain("COMPLETE final answer");
    expect(registry.composeSchema()).toEqual(schema);
  });

  it.each([ChannelType.VOICE_DM, ChannelType.GROUP, ChannelType.VOICE_GROUP])(
    "does not preempt SDK turn-taking in %s",
    async (channel) => {
      expect(
        await noToolsResponseField.shouldRun?.(context(undefined, channel)),
      ).toBe(false);
    },
  );

  it("uses the field answer and native direct-reply preemption instead of an ack", async () => {
    const registry = new ResponseHandlerFieldRegistry();
    registry.register(noToolsResponseField);
    const reply =
      "Step 1: Draft the plan. Step 2: Review it. The file was not created.";
    const run = await registry.dispatch({
      ...context(),
      rawParsed: {
        shouldRespond: "RESPOND",
        contexts: ["code"],
        candidateActionNames: ["WRITE_FILE"],
        replyText: "On it.",
        doolittleToolFreeReply: reply,
      },
    });

    expect(run.fieldErrors).toEqual({});
    expect(run.preempt?.mode).toBe("direct-reply");
    expect(run.parsed).toMatchObject({
      contexts: ["simple"],
      candidateActionNames: [],
      replyText: reply,
    });
  });

  it.each(["IGNORE", "STOP"] as const)(
    "preserves the %s decision",
    async (shouldRespond) => {
      const registry = new ResponseHandlerFieldRegistry();
      registry.register(noToolsResponseField);
      const run = await registry.dispatch({
        ...context(),
        rawParsed: { shouldRespond, doolittleToolFreeReply: "An answer." },
      });

      expect(run.preempt).toBeUndefined();
      expect(run.parsed.shouldRespond).toBe(shouldRespond);
    },
  );

  it("fails honestly if the provider omitted the complete answer", async () => {
    const registry = new ResponseHandlerFieldRegistry();
    registry.register(noToolsResponseField);
    const run = await registry.dispatch({
      ...context(),
      rawParsed: { shouldRespond: "RESPOND", doolittleToolFreeReply: "" },
    });

    expect(run.preempt?.mode).toBe("direct-reply");
    expect(run.parsed.replyText).toContain(
      "could not produce a complete answer",
    );
    expect(run.parsed.candidateActionNames).toEqual([]);
  });
});
