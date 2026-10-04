import type {
  UiHostCommand,
  UiHostEvent,
  UiHostResult,
  UiHostV1,
  UiTarget,
} from "@doolittle/contracts/ui-host";
import { describe, expect, it } from "vitest";
import {
  type AgUiEvent,
  AgUiHostAdapter,
  type AgUiRunInput,
  encodeAgUiSseEvent,
} from "./ag-ui";

const target = { botId: "bot-a", sessionId: "session-a" };
const input = {
  threadId: target.sessionId,
  runId: "run-a",
  messages: [{ id: "user-a", role: "user" as const, content: "Hello" }],
};

class Host implements UiHostV1 {
  readonly version = 1;
  listeners = new Set<(event: UiHostEvent) => void>();
  commands: UiHostCommand[] = [];
  cursors: Array<number | undefined> = [];
  handler: (command: UiHostCommand) => Promise<UiHostResult> = async () => ({
    requestId: "request",
    accepted: true,
    runId: input.runId,
    target,
  });
  getSnapshot = async () => ({
    version: 1 as const,
    revision: 1,
    sequence: 0,
    bots: [],
    conversations: [],
  });
  subscribe(
    listener: (event: UiHostEvent) => void,
    after?: number,
  ): () => void {
    this.cursors.push(after);
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  dispatch(command: UiHostCommand): Promise<UiHostResult> {
    this.commands.push(command);
    return this.handler(command);
  }
  emit(event: UiHostEvent): void {
    for (const listener of this.listeners) listener(event);
  }
  delta(sequence: number, text = "Hi", owner: UiTarget = target): void {
    this.emit({
      type: "message.delta",
      sequence,
      target: owner,
      runId: input.runId,
      messageId: "assistant-a",
      text,
    });
  }
  state(
    sequence: number,
    state:
      | "complete"
      | "running"
      | "waiting"
      | "stopped"
      | "error" = "complete",
  ): void {
    this.emit({
      type: "run.state",
      sequence,
      target,
      runId: input.runId,
      state,
    });
  }
}

async function collect(events: AsyncIterable<AgUiEvent>): Promise<AgUiEvent[]> {
  const result: AgUiEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

describe("optional AG-UI durable host projection", () => {
  it("subscribes before acknowledgement and projects attributed text exactly once", async () => {
    const host = new Host();
    host.handler = async () => {
      host.delta(1);
      host.delta(1, "duplicate");
      host.emit({
        type: "message.completed",
        sequence: 2,
        target,
        runId: input.runId,
        messageId: "assistant-a",
      });
      host.state(3);
      return {
        requestId: "request",
        accepted: true,
        runId: input.runId,
        target,
      };
    };
    const result = await new AgUiHostAdapter(host).submit(input, target);
    const events = await collect(result.events);
    expect(events.map((event) => event.type)).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "CUSTOM",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "CUSTOM",
      "RUN_FINISHED",
    ]);
    expect(
      events.filter((event) => event.type === "TEXT_MESSAGE_CONTENT"),
    ).toEqual([
      expect.objectContaining({
        delta: "Hi",
        doolittleSequence: 1,
        rawEvent: expect.objectContaining({
          type: "message.delta",
          sequence: 1,
        }),
      }),
    ]);
    expect(events[1].doolittleSequence).toBe(0);
    expect(events.at(-1)?.doolittleSequence).toBe(3);
    const sse = encodeAgUiSseEvent(events[3]);
    expect(sse).toContain("id: 1\n");
    expect(sse).not.toContain("doolittleSequence");
    expect(host.listeners.size).toBe(0);
    expect(host.commands).toHaveLength(1);
  });

  it("rejects noncanonical acknowledgements without stopping or resending", async () => {
    const host = new Host();
    host.handler = async () => ({
      requestId: "request",
      accepted: true,
      runId: "other-run",
      target,
    });
    await expect(
      new AgUiHostAdapter(host).submit(input, target),
    ).rejects.toThrow(/canonical/u);
    expect(host.listeners.size).toBe(0);
    expect(host.commands.map((command) => command.type)).toEqual(["chat.send"]);
  });

  it.each([
    { runId: "run.with.dot" },
    { runId: "x".repeat(129) },
    { tools: {} },
    { context: {} },
    { messages: { 0: input.messages[0], length: 1 } },
    { resume: [] },
    { parentRunId: "parent" },
    { tools: [{ name: "tool" }] },
    { forwardedProps: { executable: true } },
    { state: { injected: true } },
  ])(
    "rejects unsupported or malformed input before subscribing: %j",
    async (change) => {
      const host = new Host();
      await expect(
        new AgUiHostAdapter(host).submit(
          { ...input, ...change } as AgUiRunInput,
          target,
        ),
      ).rejects.toThrow();
      expect(host.commands).toHaveLength(0);
      expect(host.listeners.size).toBe(0);
    },
  );

  it("captures ownership and run identity across async acknowledgement", async () => {
    const host = new Host();
    const mutableTarget = { ...target };
    const mutableInput = { ...input };
    host.handler = async () => {
      mutableTarget.botId = "other-bot";
      mutableInput.runId = "other-run";
      return { requestId: "request", accepted: true, runId: "run-a", target };
    };
    const result = await new AgUiHostAdapter(host).submit(
      mutableInput,
      mutableTarget,
    );
    expect(result.runId).toBe("run-a");
    result.events.dispose();
  });

  it("ignores foreign bot/session/run events and visibility never implies completion", async () => {
    const host = new Host();
    const adapter = new AgUiHostAdapter(host);
    const result = await adapter.submit(input, target);
    host.delta(1, "secret", { ...target, botId: "other-bot" });
    host.delta(2, "secret", { ...target, sessionId: "other-session" });
    host.state(3, "waiting");
    const iterator = result.events[Symbol.asyncIterator]();
    expect((await iterator.next()).value.type).toBe("RUN_STARTED");
    expect((await iterator.next()).value).toMatchObject({
      type: "CUSTOM",
      value: { state: "waiting" },
    });
    result.events.dispose();
    expect((await iterator.next()).done).toBe(true);
    expect(host.commands.map((command) => command.type)).toEqual(["chat.send"]);
  });

  it("disposes without iteration and iterator return detaches before its first next", async () => {
    const host = new Host();
    const adapter = new AgUiHostAdapter(host);
    const first = await adapter.submit(input, target);
    first.events.dispose();
    expect(host.listeners.size).toBe(0);
    const second = await adapter.submit(input, target);
    await second.events[Symbol.asyncIterator]().return?.();
    expect(host.listeners.size).toBe(0);
    expect(host.commands.every((command) => command.type === "chat.send")).toBe(
      true,
    );
  });

  it("reconnect validates ownership, replays without resending and does not skip receipt cursor gaps", async () => {
    const host = new Host();
    host.handler = async () => {
      host.delta(6, "replay");
      return {
        requestId: "request",
        accepted: true,
        run: { target, runId: input.runId, state: "running", sequence: 20 },
      };
    };
    const events = new AgUiHostAdapter(host).reconnect(target, input.runId, 5);
    await Promise.resolve();
    host.delta(7, "live");
    host.state(8);
    const result = await collect(events);
    expect(
      result
        .filter((event) => event.type === "TEXT_MESSAGE_CONTENT")
        .map((event) => event.delta),
    ).toEqual(["replay", "live"]);
    expect(host.cursors).toEqual([5]);
    expect(host.commands.map((command) => command.type)).toEqual(["run.read"]);
  });

  it("terminal reconnect uses a full bounded transcript instead of mixing partial replay", async () => {
    const host = new Host();
    host.handler = async (command) => {
      if (command.type === "run.read") {
        host.delta(1, "partial");
        host.state(2);
        return {
          requestId: "request",
          accepted: true,
          run: { target, runId: input.runId, state: "complete", sequence: 2 },
        };
      }
      return {
        requestId: "request",
        accepted: true,
        target,
        transcriptThroughRunId: input.runId,
        messages: [
          {
            id: "long",
            role: "assistant",
            sourceBotId: target.botId,
            text: "x".repeat(256_000),
            createdAt: "now",
          },
        ],
      };
    };
    const result = await collect(
      new AgUiHostAdapter(host).reconnect(target, input.runId),
    );
    expect(result.map((event) => event.type)).toEqual([
      "RUN_STARTED",
      "MESSAGES_SNAPSHOT",
      "CUSTOM",
      "RUN_FINISHED",
    ]);
    expect(result[1]).toMatchObject({
      messages: [{ content: "x".repeat(256_000) }],
    });
    expect(host.commands.map((command) => command.type)).toEqual([
      "run.read",
      "transcript.read",
    ]);
  });

  it.each([() => {}, 1n, Number.NaN, { toJSON: () => "hidden" }])(
    "rejects non-JSON custom data without cancelling the durable run",
    async (value) => {
      const host = new Host();
      const result = await new AgUiHostAdapter(host).submit(input, target);
      host.emit({
        type: "custom",
        target,
        runId: input.runId,
        sequence: 1,
        name: "test",
        value,
      });
      await expect(collect(result.events)).rejects.toThrow(/JSON/u);
      expect(host.listeners.size).toBe(0);
      expect(host.commands.map((command) => command.type)).toEqual([
        "chat.send",
      ]);
    },
  );

  it("rejects observer overflow without implying cancellation", async () => {
    const host = new Host();
    const result = await new AgUiHostAdapter(host).submit(input, target);
    host.emit({
      type: "custom",
      target,
      runId: input.runId,
      sequence: 1,
      name: "test",
      value: "x".repeat(128 * 1024),
    });
    await expect(collect(result.events)).rejects.toThrow(/byte limit/u);
    expect(host.commands).toHaveLength(1);
  });

  it("rolls back partial text projections without committing undelivered text", async () => {
    const host = new Host();
    const result = await new AgUiHostAdapter(host).submit(input, target);
    host.delta(1, "x".repeat(80_000));
    const iterator = result.events[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toMatchObject({
      type: "RUN_STARTED",
      doolittleSequence: 0,
    });
    await expect(iterator.next()).rejects.toThrow(/byte limit/u);
    expect(host.listeners.size).toBe(0);
    expect(host.commands).toHaveLength(1);
  });

  it("does not replay an already acknowledged terminal lifecycle", async () => {
    const host = new Host();
    host.handler = async () => ({
      requestId: "request",
      accepted: true,
      run: { target, runId: input.runId, state: "complete", sequence: 9 },
    });
    expect(
      await collect(
        new AgUiHostAdapter(host).reconnect(target, input.runId, 9),
      ),
    ).toEqual([]);
    expect(host.commands.map((command) => command.type)).toEqual(["run.read"]);
    expect(host.listeners.size).toBe(0);
  });

  it("requires an as-of-run transcript and refuses a newer conversation snapshot", async () => {
    const host = new Host();
    host.handler = async (command) =>
      command.type === "run.read"
        ? {
            requestId: "request",
            accepted: true,
            run: { target, runId: input.runId, state: "complete", sequence: 9 },
          }
        : {
            requestId: "request",
            accepted: true,
            target,
            messages: [
              {
                id: "newer",
                role: "assistant",
                sourceBotId: target.botId,
                runId: "run-b",
                text: "Later turn",
                createdAt: "now",
              },
            ],
          };
    await expect(
      collect(new AgUiHostAdapter(host).reconnect(target, input.runId)),
    ).rejects.toThrow(/transcript/u);
    expect(host.commands[1]).toMatchObject({
      type: "transcript.read",
      throughRunId: input.runId,
    });
    expect(host.listeners.size).toBe(0);
  });

  it("maps cancellation explicitly and keeps approval decisions host-owned", async () => {
    const host = new Host();
    const adapter = new AgUiHostAdapter(host);
    const result = await adapter.submit(input, target);
    host.emit({
      type: "approval.requested",
      target,
      runId: input.runId,
      sequence: 1,
      approvalId: "approval-a",
      summary: "Edit files?",
    });
    host.state(2, "stopped");
    const events = await collect(result.events);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "CUSTOM",
        name: "doolittle.approval.requested",
        value: expect.objectContaining({ resolution: "host-owned" }),
      }),
    );
    expect(events.at(-1)).toMatchObject({
      type: "RUN_ERROR",
      code: "DOOLITTLE_CANCELLED",
    });
    await adapter.stop(target, input.runId);
    await adapter.presentApproval(target, input.runId, "approval-a");
    expect(host.commands.map((command) => command.type)).toEqual([
      "chat.send",
      "run.stop",
      "approval.present",
    ]);
  });
});
