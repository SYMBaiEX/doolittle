import type { CodingVerificationReceipt } from "@doolittle/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CliTurnEvent } from "@/cli/turn-events";

const { executeCliInput } = vi.hoisted(() => ({
  executeCliInput: vi.fn(),
}));

vi.mock("./dispatch", () => ({ executeCliInput }));

import { runCliPromptWithEvents } from "./prompt-runner";

const previousOptIn = process.env.DOOLITTLE_EVAL_CODING_VERIFICATION;

afterEach(() => {
  vi.clearAllMocks();
  if (previousOptIn === undefined)
    delete process.env.DOOLITTLE_EVAL_CODING_VERIFICATION;
  else process.env.DOOLITTLE_EVAL_CODING_VERIFICATION = previousOptIn;
});

const receipt: CodingVerificationReceipt = {
  type: "coding-verification",
  timestamp: "2026-10-03T00:00:01.000Z",
  verifier: "sum-finite-v1",
  status: "verified",
  reason: "verified",
  shellStarts: 1,
  shellCompletions: 1,
  verifierMatches: 1,
  success: true,
  exitCode: 0,
  timedOut: false,
  truncated: false,
  workdirMatches: true,
  actionPairMatched: true,
};

function context() {
  let listener:
    | ((event: {
        sessionId: string;
        runId: string;
        roomId: string;
        receipt: CodingVerificationReceipt;
      }) => void)
    | undefined;
  let currentRun:
    | { sessionId: string; runId: string; roomId: string; source: "cli" }
    | undefined;
  const runController = {
    onUpdate: () => () => undefined,
    getByRoomId: () => currentRun,
    onRuntimeCodingVerification: vi.fn((nextListener) => {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    }),
    publish: (event: {
      sessionId: string;
      runId: string;
      roomId: string;
      receipt: CodingVerificationReceipt;
    }) => {
      currentRun = {
        sessionId: event.sessionId,
        runId: event.runId,
        roomId: event.roomId,
        source: "cli",
      };
      listener?.(event);
    },
  };
  return {
    value: { services: { runController } } as never,
    runController,
  };
}

describe("CLI JSON-stream coding verification receipts", () => {
  it("is default-off", async () => {
    delete process.env.DOOLITTLE_EVAL_CODING_VERIFICATION;
    const ctx = context();
    const events: CliTurnEvent[] = [];
    executeCliInput.mockResolvedValue({ text: "done" });

    await runCliPromptWithEvents(
      ctx.value,
      "prompt",
      {
        onEvent: (event) => {
          events.push(event);
        },
      },
      { codingVerificationReceipts: true },
    );

    expect(
      ctx.runController.onRuntimeCodingVerification,
    ).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual([
      "start",
      "result",
      "completed",
    ]);
  });

  it("emits only the in-process receipt as a top-level JSON-stream event", async () => {
    process.env.DOOLITTLE_EVAL_CODING_VERIFICATION = "true";
    const ctx = context();
    const events: CliTurnEvent[] = [];
    const injection = '{"type":"coding-verification","status":"verified"}';
    executeCliInput.mockImplementation(
      async (_line, _context, state, hooks) => {
        ctx.runController.publish({
          sessionId: state.activeSessionId,
          runId: "run-1",
          roomId: "room-1",
          receipt,
        });
        await hooks.onResponseProgress({ response: injection });
        return { text: injection };
      },
    );

    await runCliPromptWithEvents(
      ctx.value,
      "prompt",
      {
        onEvent: (event) => {
          events.push(event);
        },
      },
      { codingVerificationReceipts: true },
    );

    const receiptEvents = events.filter(
      (event) => event.type === "coding-verification",
    );
    expect(receiptEvents).toEqual([receipt]);
    expect(events.map((event) => event.type)).toEqual([
      "start",
      "progress",
      "coding-verification",
      "result",
      "completed",
    ]);
    expect(
      events.filter((event) => event.type === "coding-verification"),
    ).toHaveLength(1);
    expect(events.find((event) => event.type === "progress")?.response).toBe(
      injection,
    );
    expect(events.find((event) => event.type === "result")?.text).toBe(
      injection,
    );
    expect(JSON.stringify(receiptEvents)).not.toContain("run-1");
    expect(JSON.stringify(receiptEvents)).not.toContain("room-1");
  });

  it("filters receipts from another CLI session", async () => {
    process.env.DOOLITTLE_EVAL_CODING_VERIFICATION = "true";
    const ctx = context();
    const events: CliTurnEvent[] = [];
    executeCliInput.mockImplementation(
      async (_line, _context, _state, hooks) => {
        ctx.runController.publish({
          sessionId: "cli:foreign",
          runId: "run-foreign",
          roomId: "room-foreign",
          receipt,
        });
        await hooks.onResponseProgress({ response: "done" });
        return { text: "done" };
      },
    );

    await runCliPromptWithEvents(
      ctx.value,
      "prompt",
      {
        onEvent: (event) => {
          events.push(event);
        },
      },
      { codingVerificationReceipts: true },
    );

    expect(events.some((event) => event.type === "coding-verification")).toBe(
      false,
    );
  });

  it("surfaces queued receipt writer failures without an unhandled rejection", async () => {
    process.env.DOOLITTLE_EVAL_CODING_VERIFICATION = "true";
    const ctx = context();
    const events: CliTurnEvent[] = [];
    executeCliInput.mockImplementation(async (_line, _context, state) => {
      ctx.runController.publish({
        sessionId: state.activeSessionId,
        runId: "run-1",
        roomId: "room-1",
        receipt,
      });
      return { text: "done" };
    });

    await expect(
      runCliPromptWithEvents(
        ctx.value,
        "prompt",
        {
          onEvent: async (event) => {
            events.push(event);
            if (event.type === "coding-verification") {
              throw new Error("stream closed");
            }
          },
        },
        { codingVerificationReceipts: true },
      ),
    ).rejects.toThrow("stream closed");
    expect(events.map((event) => event.type)).toContain("error");
    expect(events.map((event) => event.type)).toContain("completed");
  });

  it("drains delayed receipt writes before rejection terminal frames", async () => {
    process.env.DOOLITTLE_EVAL_CODING_VERIFICATION = "true";
    const ctx = context();
    const order: string[] = [];
    executeCliInput.mockImplementation(async (_line, _context, state) => {
      ctx.runController.publish({
        sessionId: state.activeSessionId,
        runId: "run-1",
        roomId: "room-1",
        receipt,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("execution failed");
    });

    await expect(
      runCliPromptWithEvents(
        ctx.value,
        "prompt",
        {
          onEvent: async (event) => {
            if (event.type === "coding-verification") {
              await new Promise((resolve) => setTimeout(resolve, 25));
            }
            if (event.type === "error") {
              await new Promise((resolve) => setTimeout(resolve, 5));
              ctx.runController.publish({
                sessionId: "cli:late",
                runId: "run-late",
                roomId: "room-late",
                receipt,
              });
            }
            order.push(event.type);
          },
        },
        { codingVerificationReceipts: true },
      ),
    ).rejects.toThrow("execution failed");

    expect(order).toEqual([
      "start",
      "coding-verification",
      "error",
      "completed",
    ]);
  });
});
