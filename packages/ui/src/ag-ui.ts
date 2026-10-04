import type {
  UiHostEvent,
  UiHostResult,
  UiHostV1,
  UiMessage,
  UiRunReceipt,
  UiTarget,
} from "@doolittle/contracts/ui-host";

/** Optional AG-UI projection; Doolittle remains the sole execution owner. */
export interface AgUiRunInput {
  threadId: string;
  runId: string;
  messages: Array<{ id: string; role: "user"; content: string }>;
  tools?: readonly unknown[];
  context?: readonly unknown[];
  state?: unknown;
  forwardedProps?: unknown;
  resume?: readonly unknown[];
  parentRunId?: string;
}

type Cursor = {
  /** Transport metadata, removed from AG-UI JSON by encodeAgUiSseEvent. */
  doolittleSequence: number;
  rawEvent: unknown;
};
export type AgUiEvent = Cursor &
  (
    | { type: "RUN_STARTED" | "RUN_FINISHED"; threadId: string; runId: string }
    | { type: "RUN_ERROR"; message: string; code: string }
    | { type: "TEXT_MESSAGE_START"; messageId: string; role: "assistant" }
    | { type: "TEXT_MESSAGE_CONTENT"; messageId: string; delta: string }
    | { type: "TEXT_MESSAGE_END"; messageId: string }
    | {
        type: "MESSAGES_SNAPSHOT";
        messages: Array<{
          id: string;
          role: UiMessage["role"];
          content: string;
        }>;
      }
    | { type: "CUSTOM"; name: string; value: unknown }
  );

export interface AgUiEventStream extends AsyncIterable<AgUiEvent> {
  /** Detaches even if iteration never began. Never stops the durable run. */
  dispose(): void;
}

const identity = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,255}$/u;
// Match native durable run routes, not the more permissive message identity.
const runIdentity = /^[a-zA-Z0-9:_-]{1,128}$/u;
const MAX_QUEUE = 1024;
const MAX_EVENT_BYTES = 128 * 1024;
const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

function sameTarget(a: UiTarget, b: UiTarget): boolean {
  return (
    a.botId === b.botId &&
    a.sessionId === b.sessionId &&
    a.projectId === b.projectId
  );
}

function captureTarget(target: UiTarget): UiTarget {
  if (
    !identity.test(target.botId) ||
    !identity.test(target.sessionId) ||
    (target.projectId !== undefined && !identity.test(target.projectId))
  )
    throw new Error("An explicit owned conversation is required.");
  return {
    botId: target.botId,
    sessionId: target.sessionId,
    ...(target.projectId === undefined ? {} : { projectId: target.projectId }),
  };
}

function empty(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.keys(value).length === 0)
  );
}

function validateInput(input: AgUiRunInput, target: UiTarget): string {
  if (!runIdentity.test(input.runId) || input.threadId !== target.sessionId)
    throw new Error(
      "AG-UI run and thread must match an explicit owned conversation.",
    );
  const keys = new Set([
    "threadId",
    "runId",
    "messages",
    "tools",
    "context",
    "state",
    "forwardedProps",
    "resume",
    "parentRunId",
  ]);
  if (Object.keys(input).some((key) => !keys.has(key)))
    throw new Error("Unsupported AG-UI input field.");
  if (input.resume !== undefined || input.parentRunId !== undefined)
    throw new Error(
      "AG-UI interrupt/branch resume is unsupported. Reconnect observes an existing durable run; it does not resume an interrupt.",
    );
  if (
    (input.tools !== undefined &&
      (!Array.isArray(input.tools) || input.tools.length !== 0)) ||
    (input.context !== undefined &&
      (!Array.isArray(input.context) || input.context.length !== 0)) ||
    !empty(input.state) ||
    !empty(input.forwardedProps)
  )
    throw new Error(
      "Client tools, state, context and forwarded properties are unsupported by this host adapter.",
    );
  const message = Array.isArray(input.messages) ? input.messages[0] : undefined;
  if (
    !Array.isArray(input.messages) ||
    input.messages.length !== 1 ||
    !message ||
    message.role !== "user" ||
    !identity.test(message.id) ||
    typeof message.content !== "string" ||
    !message.content.trim() ||
    message.content.length > 64_000 ||
    Object.keys(message).some((key) => !["id", "role", "content"].includes(key))
  )
    throw new Error(
      "Submit exactly one new text user message; canonical history stays in Doolittle.",
    );
  return message.content;
}

/** Reject values JSON.stringify silently drops or changes; never execute toJSON. */
function jsonData(value: unknown, maxBytes: number): unknown {
  const active = new Set<object>();
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 200_000 || depth > 64)
      throw new Error("Host event exceeds JSON nesting limits.");
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item !== "object" || active.has(item))
      throw new Error("Host event is not JSON-safe.");
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype
    )
      throw new Error("Host event is not plain JSON data.");
    active.add(item);
    if (Object.getOwnPropertySymbols(item).length)
      throw new Error("Host event contains symbol keys.");
    for (const key of Object.keys(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !("value" in descriptor))
        throw new Error("Host event contains an accessor.");
      visit(descriptor.value, depth + 1);
    }
    active.delete(item);
  };
  visit(value, 0);
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).byteLength > maxBytes)
    throw new Error(
      "AG-UI observer byte limit exceeded. The durable run has not been cancelled.",
    );
  return JSON.parse(json);
}

/** Cursor is an SSE id, while rawEvent retains the actual transformed source. */
export function encodeAgUiSseEvent(event: AgUiEvent): string {
  const { doolittleSequence, ...wire } = event;
  return `id: ${doolittleSequence}\ndata: ${JSON.stringify(wire)}\n\n`;
}

class Projection implements AgUiEventStream {
  private queue: AgUiEvent[] = [];
  private wake: (() => void) | undefined;
  private closed = false;
  private error: Error | undefined;
  private unsubscribe: () => void = () => {};
  private live = false;
  private buffered: Exclude<UiHostEvent, { type: "snapshot" }>[] = [];
  private text = new Set<string>();
  private lastSequence: number;
  private iterating = false;

  constructor(
    private readonly target: UiTarget,
    private readonly runId: string,
    after: number,
  ) {
    if (!Number.isSafeInteger(after) || after < 0)
      throw new Error("A nonnegative replay cursor is required.");
    this.lastSequence = after;
  }

  attach(unsubscribe: () => void): void {
    this.unsubscribe = unsubscribe;
    if (this.closed) unsubscribe();
  }

  receive = (event: UiHostEvent): void => {
    if (
      this.closed ||
      event.type === "snapshot" ||
      !sameTarget(event.target, this.target) ||
      event.runId !== this.runId ||
      event.sequence <= this.lastSequence
    )
      return;
    try {
      if (!Number.isSafeInteger(event.sequence) || event.sequence < 1)
        throw new Error("Invalid host sequence.");
      const captured = jsonData(event, MAX_EVENT_BYTES) as Exclude<
        UiHostEvent,
        { type: "snapshot" }
      >;
      if (!this.live) {
        if (this.buffered.length >= MAX_QUEUE)
          throw new Error(
            "AG-UI observer backlog exceeded its limit. Reconnect from the last cursor.",
          );
        this.buffered.push(captured);
      } else this.project(captured);
    } catch (error) {
      this.fail(
        error instanceof Error ? error : new Error("Invalid host event."),
      );
    }
  };

  start(source: unknown): void {
    if (this.closed || this.live) return;
    this.push({
      type: "RUN_STARTED",
      threadId: this.target.sessionId,
      runId: this.runId,
      ...this.metadata(source),
    });
    this.live = true;
    const buffered = this.buffered.sort((a, b) => a.sequence - b.sequence);
    this.buffered = [];
    for (const event of buffered) this.receive(event);
  }

  // A terminal receipt plus full canonical transcript replaces partial replay.
  terminalSnapshot(receipt: UiRunReceipt, messages: UiMessage[]): void {
    if (this.closed) return;
    this.buffered = [];
    this.start(receipt);
    this.push({
      type: "MESSAGES_SNAPSHOT",
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.text,
      })),
      ...this.metadata(receipt),
    });
    this.state(receipt);
  }

  private metadata(source: unknown): Cursor {
    return { doolittleSequence: this.lastSequence, rawEvent: source };
  }

  private push(event: AgUiEvent): void {
    if (this.closed) return;
    try {
      if (this.queue.length >= MAX_QUEUE)
        throw new Error(
          "AG-UI observer queue limit exceeded. The durable run has not been cancelled.",
        );
      this.queue.push(
        jsonData(
          event,
          event.type === "MESSAGES_SNAPSHOT"
            ? MAX_SNAPSHOT_BYTES
            : MAX_EVENT_BYTES,
        ) as AgUiEvent,
      );
      this.wake?.();
      this.wake = undefined;
    } catch (error) {
      this.fail(
        error instanceof Error ? error : new Error("Invalid host event."),
      );
    }
  }

  private endMessage(messageId: string, source: unknown): void {
    if (this.text.delete(messageId))
      this.push({
        type: "TEXT_MESSAGE_END",
        messageId,
        ...this.metadata(source),
      });
  }

  private commitCursor(sequence: number): void {
    // Commit only on the last projected event, so reconnect cannot skip text
    // after receiving only its START/source attribution events.
    if (this.queue.length)
      this.queue[this.queue.length - 1].doolittleSequence = sequence;
    this.lastSequence = sequence;
  }

  private project(event: Exclude<UiHostEvent, { type: "snapshot" }>): void {
    const queueStart = this.queue.length;
    if (event.type === "message.delta") {
      if (event.text) {
        if (!this.text.has(event.messageId)) {
          this.text.add(event.messageId);
          this.push({
            type: "TEXT_MESSAGE_START",
            messageId: event.messageId,
            role: "assistant",
            ...this.metadata(event),
          });
          this.push({
            type: "CUSTOM",
            name: "doolittle.message.source",
            value: {
              messageId: event.messageId,
              botId: event.sourceBotId ?? event.target.botId,
            },
            ...this.metadata(event),
          });
        }
        this.push({
          type: "TEXT_MESSAGE_CONTENT",
          messageId: event.messageId,
          delta: event.text,
          ...this.metadata(event),
        });
      }
    } else if (event.type === "message.completed")
      this.endMessage(event.messageId, event);
    else if (event.type === "approval.requested")
      this.push({
        type: "CUSTOM",
        name: "doolittle.approval.requested",
        value: {
          approvalId: event.approvalId,
          summary: event.summary,
          runId: event.runId,
          target: event.target,
          resolution: "host-owned",
        },
        ...this.metadata(event),
      });
    else if (event.type === "custom")
      this.push({
        type: "CUSTOM",
        name: event.name,
        value: event.value,
        ...this.metadata(event),
      });
    else if (event.type === "run.state")
      this.state(
        {
          target: event.target,
          runId: event.runId,
          state: event.state,
          sequence: event.sequence,
        },
        event,
      );
    // Projection is synchronous: rollback a partially enqueued source before
    // consumers wake, and never acknowledge text that failed validation.
    if (this.error) this.queue.splice(queueStart);
    else this.commitCursor(event.sequence);
  }

  private state(receipt: UiRunReceipt, source: unknown = receipt): void {
    if (
      this.closed ||
      !sameTarget(receipt.target, this.target) ||
      receipt.runId !== this.runId
    )
      return;
    this.push({
      type: "CUSTOM",
      name: "doolittle.run.state",
      value: {
        state: receipt.state,
        target: receipt.target,
        runId: receipt.runId,
      },
      ...this.metadata(source),
    });
    if (!["complete", "stopped", "error"].includes(receipt.state)) return;
    for (const messageId of [...this.text]) this.endMessage(messageId, source);
    this.push(
      receipt.state === "complete"
        ? {
            type: "RUN_FINISHED",
            threadId: this.target.sessionId,
            runId: this.runId,
            ...this.metadata(source),
          }
        : {
            type: "RUN_ERROR",
            code:
              receipt.state === "stopped"
                ? "DOOLITTLE_CANCELLED"
                : "DOOLITTLE_RUN_ERROR",
            message:
              receipt.state === "stopped"
                ? "The durable run was stopped."
                : "The durable run failed.",
            ...this.metadata(source),
          },
    );
    if (!this.error) this.commitCursor(receipt.sequence);
    this.dispose();
  }

  fail(error: Error): void {
    if (!this.closed) {
      this.error = error;
      this.dispose();
    }
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.buffered = [];
    this.unsubscribe();
    this.wake?.();
    this.wake = undefined;
  }

  [Symbol.asyncIterator](): AsyncIterator<AgUiEvent> {
    if (this.iterating) throw new Error("An AG-UI stream has one consumer.");
    this.iterating = true;
    return {
      next: async () => {
        while (true) {
          const event = this.queue.shift();
          if (event) return { value: event, done: false };
          if (this.closed) {
            if (this.error) throw this.error;
            return { value: undefined, done: true };
          }
          await new Promise<void>((resolve) => {
            this.wake = resolve;
          });
        }
      },
      return: async () => {
        this.dispose();
        this.queue = [];
        return { value: undefined, done: true };
      },
      throw: async (error: unknown) => {
        this.dispose();
        this.queue = [];
        throw error;
      },
    };
  }
}

/** Text/lifecycle subset. Approval decisions and interrupt continuation remain host-owned. */
export class AgUiHostAdapter {
  constructor(private readonly host: UiHostV1) {}

  async submit(
    input: AgUiRunInput,
    target: UiTarget,
  ): Promise<{ runId: string; events: AgUiEventStream }> {
    const owned = captureTarget(target);
    const runId = input.runId;
    const message = validateInput(input, owned);
    const projection = new Projection(owned, runId, 0);
    projection.attach(this.host.subscribe(projection.receive));
    try {
      const result = await this.host.dispatch({
        type: "chat.send",
        target: owned,
        submissionId: runId,
        runId,
        message,
      });
      if (
        !result.accepted ||
        result.runId !== runId ||
        !result.target ||
        !sameTarget(result.target, owned)
      )
        throw new Error(
          result.error ?? "Host rejected the canonical AG-UI run identity.",
        );
      projection.start(result);
      return { runId, events: projection };
    } catch (error) {
      projection.dispose();
      throw error;
    }
  }

  reconnect(
    target: UiTarget,
    runId: string,
    afterSequence = 0,
  ): AgUiEventStream {
    const owned = captureTarget(target);
    if (!runIdentity.test(runId))
      throw new Error("A canonical run identity is required.");
    const projection = new Projection(owned, runId, afterSequence);
    projection.attach(this.host.subscribe(projection.receive, afterSequence));
    void this.host
      .dispatch({ type: "run.read", target: owned, runId })
      .then(async (result) => {
        if (
          !result.accepted ||
          !result.run ||
          result.run.runId !== runId ||
          !sameTarget(result.run.target, owned)
        )
          throw new Error(result.error ?? "Owned run receipt is unavailable.");
        const receipt = { ...result.run, target: { ...result.run.target } };
        if (!Number.isSafeInteger(receipt.sequence) || receipt.sequence < 0)
          throw new Error("Invalid owned run receipt cursor.");
        if (["complete", "stopped", "error"].includes(receipt.state)) {
          if (afterSequence >= receipt.sequence) {
            projection.dispose();
            return;
          }
          const transcript = await this.host.dispatch({
            type: "transcript.read",
            target: owned,
            throughRunId: runId,
          });
          if (
            !transcript.accepted ||
            !transcript.messages ||
            !transcript.target ||
            !sameTarget(transcript.target, owned) ||
            transcript.transcriptThroughRunId !== runId
          )
            throw new Error(
              transcript.error ?? "Canonical transcript is unavailable.",
            );
          projection.terminalSnapshot(receipt, transcript.messages);
        } else projection.start(receipt); // Never jump beyond unread replay to a receipt cursor.
      })
      .catch((error: unknown) =>
        projection.fail(
          error instanceof Error
            ? error
            : new Error("The host observer failed."),
        ),
      );
    return projection;
  }

  stop(target: UiTarget, runId: string): Promise<UiHostResult> {
    if (!runIdentity.test(runId))
      throw new Error("A canonical run identity is required.");
    return this.host.dispatch({
      type: "run.stop",
      target: captureTarget(target),
      runId,
    });
  }

  presentApproval(
    target: UiTarget,
    runId: string,
    approvalId: string,
  ): Promise<UiHostResult> {
    if (!runIdentity.test(runId) || !identity.test(approvalId))
      throw new Error("An owned run and approval identity is required.");
    return this.host.dispatch({
      type: "approval.present",
      target: captureTarget(target),
      runId,
      approvalId,
    });
  }
}
