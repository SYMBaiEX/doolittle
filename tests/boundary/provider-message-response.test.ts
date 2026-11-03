import { randomUUID } from "node:crypto";
import type {
  ActionResult,
  Memory,
  MessageProcessingResult,
} from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "../../packages/agent/src/runtime/chat";
import {
  discardUnsynthesizedResponseMemories,
  isSdkFailureReply,
  providerMessageActionResults,
  resolveSdkMessageResponse,
  sdkFailure,
} from "../../packages/agent/src/runtime/chat-turn/provider-message-response";

function message(text: string): Memory {
  return {
    id: randomUUID(),
    agentId: randomUUID(),
    entityId: randomUUID(),
    roomId: randomUUID(),
    content: { text },
  };
}

function action(text: string): ActionResult {
  return { success: true, text };
}

function sdkResult(
  outcome: MessageProcessingResult["outcome"],
): MessageProcessingResult {
  return { outcome, didRespond: false, responseMessages: [] };
}

describe("SDK message response selection", () => {
  it("prefers the canonical terminal response over provisional and early tool replies", () => {
    expect(
      resolveSdkMessageResponse({
        responseContent: { text: "  Verified final answer.  " },
        responseMessages: [message("I will inspect the files.")],
        provisionalResponse: "Still working…",
        actionResults: [action("inspection")],
      }),
    ).toEqual({
      text: "Verified final answer.",
      origin: "current-response-content",
    });
  });

  it("does not promote an early response or stream to terminal output after actions", () => {
    expect(
      resolveSdkMessageResponse({
        responseContent: { text: "  " },
        responseMessages: [message("Everything is complete.")],
        provisionalResponse: "provisional reply",
        actionResults: [action("workspace changed")],
      }),
    ).toEqual({ text: "", origin: "empty-after-actions" });
  });

  it("uses the latest nonempty SDK reply for a turn without actions", () => {
    const replies = [message("first"), message(" second "), message(" ")];
    expect(
      resolveSdkMessageResponse({
        responseMessages: replies,
        provisionalResponse: "streamed",
        actionResults: [],
      }),
    ).toEqual({ text: "second", origin: "response-message-fallback" });
    expect(replies.map((reply) => reply.content.text)).toEqual([
      "first",
      " second ",
      " ",
    ]);
  });

  it.each([
    [" streamed ", { text: "streamed", origin: "provisional-stream-fallback" }],
    [" ", { text: "", origin: "empty" }],
  ])(
    "uses the bounded provisional fallback when SDK replies are empty",
    (provisionalResponse, expected) => {
      expect(
        resolveSdkMessageResponse({
          responseMessages: [],
          actionResults: [],
          provisionalResponse,
        }),
      ).toEqual(expected);
    },
  );
});

describe("SDK action result normalization", () => {
  it("keeps direct, state, and settled evidence precedence without rewriting receipts", () => {
    const direct = [action("direct")];
    const state = [action("state")];
    const settled = [action("settled")];
    expect(
      providerMessageActionResults(
        { actionResults: direct, state: { data: { actionResults: state } } },
        settled,
      ),
    ).toBe(direct);
    expect(
      providerMessageActionResults(
        { actionResults: [], state: { data: { actionResults: state } } },
        settled,
      ),
    ).toBe(state);
    expect(
      providerMessageActionResults(
        { actionResults: [], state: { data: { actionResults: [] } } },
        settled,
      ),
    ).toBe(settled);
  });

  it("retains settled receipts when result projections are absent or malformed", () => {
    const settled = [action("committed")];
    for (const result of [
      undefined,
      null,
      "invalid",
      { actionResults: {}, state: { data: { actionResults: "invalid" } } },
    ]) {
      expect(providerMessageActionResults(result, settled)).toBe(settled);
    }
  });
});

describe("SDK execution outcome normalization", () => {
  it("keeps a completed outcome separate from whether a response was delivered", () => {
    const result = sdkResult({ status: "completed", effects: [] });
    expect(isSdkFailureReply(result)).toBe(false);
    expect(sdkFailure(result)).toBeUndefined();
    expect(isSdkFailureReply(undefined)).toBe(false);
    expect(sdkFailure(undefined)).toBeUndefined();
  });

  it("preserves a typed SDK failure including its planner-exhaustion category", () => {
    const error = {
      kind: "planner_exhaustion",
      transient: false,
      message: "Planner budget exhausted.",
    };
    const result = sdkResult({ status: "failed", error, effects: [] });
    expect(isSdkFailureReply(result)).toBe(true);
    expect(sdkFailure(result)).toBe(error);
  });

  it.each(["denied", "cancelled"] as const)(
    "preserves a %s outcome and its explanation",
    (status) => {
      const result = sdkResult({
        status,
        reason: "Stopped by the current policy.",
        effects: [],
      });
      expect(isSdkFailureReply(result)).toBe(true);
      expect(sdkFailure(result)).toEqual({
        kind: status,
        message: "Stopped by the current policy.",
      });
    },
  );
});

describe("unsynthesized native response memory cleanup", () => {
  it("attempts all raw-reply deletions, warns on failure, and retains unrelated replies", async () => {
    const raw = message("  raw tool output  ");
    const duplicate = message("raw tool output");
    const final = message("synthesized explanation");
    const warn = vi.fn();
    const runtime = {
      marker: "runtime-owner",
      logger: { warn },
      deleteMemory: vi.fn(async function (
        this: { marker: string },
        id: string,
      ) {
        expect(this.marker).toBe("runtime-owner");
        if (id === raw.id) throw new Error("storage unavailable");
      }),
    };
    const retained = await discardUnsynthesizedResponseMemories({
      context: { runtime } as unknown as AgentExecutionContext,
      response: "raw tool output",
      responseMessages: [raw, final, duplicate],
      runId: "run",
      sessionId: "session",
      roomId: "room",
    });
    expect(runtime.deleteMemory.mock.calls.map(([id]) => id)).toEqual([
      raw.id,
      duplicate.id,
    ]);
    expect(retained).toEqual([final]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        failedDeletes: 1,
        rejectedMemoryIds: [raw.id, duplicate.id],
      }),
      expect.any(String),
    );
  });

  it("preserves the original collection when the raw reply was not persisted", async () => {
    const replies = [message("different answer")];
    const deleteMemory = vi.fn();
    const retained = await discardUnsynthesizedResponseMemories({
      context: {
        runtime: { deleteMemory },
      } as unknown as AgentExecutionContext,
      response: "raw output",
      responseMessages: replies,
      sessionId: "session",
      roomId: "room",
    });
    expect(retained).toBe(replies);
    expect(deleteMemory).not.toHaveBeenCalled();
  });
});
