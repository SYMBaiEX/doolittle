import { randomUUID } from "node:crypto";
import type {
  ChatRunSteerMessage,
  ChatRunSteerRejectionCode,
  ChatRunSteerSubmissionResult,
} from "@doolittle/contracts/steer";
import type { Memory, UUID } from "@elizaos/core";
import type { AgentExecutionContext } from "../chat";
import type { TurnContinuationBudget } from "../turn-runtime-scope";
import { persistUserTurnMemory } from "./conversation-persistence";
import type { TurnState } from "./state";

type PendingSteerState = "persisting" | "ready";

type PendingSteerEntry = {
  id: string;
  userId: string;
  text: string;
  sequence: number;
  batchId: number;
  createdAt: string;
  state: PendingSteerState;
  memory?: Memory;
  settled: Promise<boolean>;
  settle: (ready: boolean) => void;
};

export type RunSteerChannelCloseResult = {
  unconsumed: ChatRunSteerMessage[];
  persistenceInFlight: number;
};

function publicSteerMessage(entry: PendingSteerEntry): ChatRunSteerMessage {
  return {
    id: entry.id,
    userId: entry.userId,
    text: entry.text,
    sequence: entry.sequence,
    createdAt: entry.createdAt,
  };
}

/**
 * In-process admission channel for user input into one active workspace turn.
 * A reservation owns continuation capacity before any durable write begins, so
 * acceptance cannot race the pass boundary it is supposed to use.
 */
export class RunSteerChannel {
  private readonly entries: PendingSteerEntry[] = [];
  private readonly reservedBatchIds = new Set<number>();
  private readonly drainingBatchIds = new Set<number>();
  private nextSequence = 0;
  private nextBatchId = 0;
  private openBatchId: number | undefined;
  private accepting = true;

  constructor(
    readonly runId: string,
    readonly sessionId: string,
    readonly userId: string,
    readonly turn: TurnState,
    private readonly continuationBudget: TurnContinuationBudget,
  ) {}

  get isAccepting(): boolean {
    return this.accepting;
  }

  private oldestPendingBatchId(): number | undefined {
    let oldest: number | undefined;
    for (const entry of this.entries) {
      if (oldest === undefined || entry.batchId < oldest) {
        oldest = entry.batchId;
      }
    }
    return oldest;
  }

  private releaseBatchReservationIfEmpty(batchId: number): void {
    if (this.entries.some((entry) => entry.batchId === batchId)) return;
    if (this.reservedBatchIds.delete(batchId)) {
      this.continuationBudget.releaseReservedPass();
    }
    if (this.openBatchId === batchId) {
      this.openBatchId = this.oldestPendingBatchId();
    }
  }

  reserveSubmission(input: {
    userId: string;
    text: string;
  }):
    | { ok: true; entry: PendingSteerEntry }
    | { ok: false; code: ChatRunSteerRejectionCode } {
    if (!this.accepting) return { ok: false, code: "run_not_active" };
    if (input.userId !== this.userId) {
      return { ok: false, code: "user_mismatch" };
    }

    const openBatch = this.openBatchId;
    const canJoinOpenBatch =
      openBatch !== undefined &&
      !this.drainingBatchIds.has(openBatch) &&
      this.entries.some((entry) => entry.batchId === openBatch);
    let batchId: number;
    if (canJoinOpenBatch) {
      batchId = openBatch;
    } else {
      batchId = ++this.nextBatchId;
      if (!this.continuationBudget.tryReservePass()) {
        return { ok: false, code: "steer_budget_exhausted" };
      }
      this.reservedBatchIds.add(batchId);
      this.openBatchId = batchId;
    }

    let settle: (ready: boolean) => void = () => undefined;
    const settled = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    this.nextSequence += 1;
    const entry: PendingSteerEntry = {
      id: randomUUID(),
      userId: input.userId,
      text: input.text,
      sequence: this.nextSequence,
      batchId,
      createdAt: new Date().toISOString(),
      state: "persisting",
      settled,
      settle,
    };
    this.entries.push(entry);
    return { ok: true, entry };
  }

  markSubmissionPersisted(entry: PendingSteerEntry, memory: Memory): void {
    if (!this.entries.includes(entry) || entry.state !== "persisting") return;
    entry.memory = memory;
    entry.state = "ready";
    entry.settle(true);
  }

  abandonSubmission(entry: PendingSteerEntry): void {
    const index = this.entries.indexOf(entry);
    if (index >= 0) this.entries.splice(index, 1);
    if (entry.state === "persisting") entry.settle(false);
    this.releaseBatchReservationIfEmpty(entry.batchId);
  }

  /**
   * Drain the oldest durable FIFO batch at a whole-pass boundary. Entries
   * admitted while this drain is waiting belong to a later batch and hold
   * their own pass reservation; they cannot steal the pass promised here.
   */
  async drainAtPassBoundary(
    signal?: AbortSignal,
  ): Promise<ChatRunSteerMessage[]> {
    if (!this.accepting) return [];
    const batchId = this.oldestPendingBatchId();
    if (batchId === undefined) return [];
    this.drainingBatchIds.add(batchId);
    try {
      const boundaryEntries = this.entries.filter(
        (entry) => entry.batchId === batchId,
      );
      const persistence = Promise.all(
        boundaryEntries
          .filter((entry) => entry.state === "persisting")
          .map((entry) => entry.settled),
      );
      if (signal) {
        await Promise.race([
          persistence,
          new Promise<never>((_, reject) => {
            const abort = () => {
              const error = new Error("Agent run cancelled.");
              error.name = "AbortError";
              reject(error);
            };
            if (signal.aborted) abort();
            else signal.addEventListener("abort", abort, { once: true });
          }),
        ]);
      } else {
        await persistence;
      }

      const ready = this.entries
        .filter((entry) => entry.batchId === batchId && entry.state === "ready")
        .sort((a, b) => a.sequence - b.sequence);
      if (ready.length === 0) {
        this.releaseBatchReservationIfEmpty(batchId);
        return [];
      }

      const readySet = new Set(ready);
      for (let index = this.entries.length - 1; index >= 0; index -= 1) {
        if (readySet.has(this.entries[index])) this.entries.splice(index, 1);
      }
      // Ownership of this batch's reserved pass moves to the loop's next
      // beginPass call. Do not release it here; beginPass consumes it.
      this.reservedBatchIds.delete(batchId);
      if (this.openBatchId === batchId) {
        this.openBatchId = this.oldestPendingBatchId();
      }
      return ready.map(publicSteerMessage);
    } finally {
      this.drainingBatchIds.delete(batchId);
    }
  }

  close(): RunSteerChannelCloseResult {
    this.accepting = false;
    const unconsumed = this.entries
      .filter((entry) => entry.state === "ready")
      .map(publicSteerMessage);
    const persisting = this.entries.filter(
      (entry) => entry.state === "persisting",
    );
    for (const entry of persisting) entry.settle(false);
    for (const _batchId of this.reservedBatchIds) {
      this.continuationBudget.releaseReservedPass();
    }
    this.reservedBatchIds.clear();
    this.entries.length = 0;
    return {
      unconsumed,
      persistenceInFlight: persisting.length,
    };
  }
}

const steerChannelsByRuntime = new WeakMap<
  object,
  Map<string, RunSteerChannel>
>();

export function openRunSteerChannel(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  userId: string;
  continuationBudget: TurnContinuationBudget;
}): RunSteerChannel {
  const channel = new RunSteerChannel(
    input.turn.runId,
    input.turn.sessionId,
    input.userId,
    input.turn,
    input.continuationBudget,
  );
  let channels = steerChannelsByRuntime.get(input.context.runtime);
  if (!channels) {
    channels = new Map();
    steerChannelsByRuntime.set(input.context.runtime, channels);
  }
  if (channels.has(channel.runId)) {
    throw new Error(
      `A steer channel is already active for run ${channel.runId}.`,
    );
  }
  channels.set(channel.runId, channel);
  return channel;
}

export function closeRunSteerChannel(
  context: AgentExecutionContext,
  channel: RunSteerChannel,
): RunSteerChannelCloseResult {
  const channels = steerChannelsByRuntime.get(context.runtime);
  if (channels?.get(channel.runId) === channel) {
    channels.delete(channel.runId);
    if (channels.size === 0) steerChannelsByRuntime.delete(context.runtime);
  }
  return channel.close();
}

function rejection(
  code: ChatRunSteerRejectionCode,
  message: string,
): ChatRunSteerSubmissionResult {
  return { accepted: false, code, message };
}

/**
 * Persist and admit a user-authored steer message for an active workspace run.
 * This function is the backend surface a future HTTP route should call; it is
 * intentionally synchronous with the channel reservation before its first await.
 */
export async function submitRunSteer(input: {
  context: AgentExecutionContext;
  runId: string;
  message: string;
  userId?: string;
  sessionId?: string;
  signal?: AbortSignal;
}): Promise<ChatRunSteerSubmissionResult> {
  const text = input.message.trim();
  if (!text) {
    return rejection("empty_message", "A steer message is required.");
  }
  const channel = steerChannelsByRuntime
    .get(input.context.runtime)
    ?.get(input.runId);
  if (!channel) {
    const receipt = input.context.services.runController.getByRunId(
      input.runId,
    );
    return receipt && !receipt.endedAt
      ? rejection(
          "run_not_steerable",
          "This active run does not have a continuation-pass steer boundary.",
        )
      : rejection(
          "run_not_active",
          "No active steerable run exists for this run id.",
        );
  }
  if (input.sessionId !== undefined && input.sessionId !== channel.sessionId) {
    return rejection(
      "session_mismatch",
      "The steer session does not match the active run.",
    );
  }

  // Reserve synchronously before the first await. If the current pass finishes
  // concurrently, the boundary either drains this entry or rejects new entries
  // because the channel has already closed; there is no unaccounted middle state.
  const reservation = channel.reserveSubmission({
    userId: input.userId ?? channel.userId,
    text,
  });
  if (!reservation.ok) {
    return rejection(
      reservation.code,
      reservation.code === "user_mismatch"
        ? "The steer author does not match the active run's user."
        : reservation.code === "steer_budget_exhausted"
          ? "This run has no continuation-pass capacity left for steer input."
          : "This run is no longer accepting steer input.",
    );
  }
  const { entry } = reservation;

  try {
    const steerTurn: TurnState = {
      ...channel.turn,
      messageId: entry.id,
    };
    await persistUserTurnMemory({
      context: input.context,
      turn: steerTurn,
      userId: entry.userId,
      text: entry.text,
      nativeOwner: "doolittle",
      signal: input.signal,
      doolittleMetadata: {
        steer: {
          runId: channel.runId,
          originalMessageId: channel.turn.messageId,
          sequence: entry.sequence,
        },
      },
    });
    const memory: Memory = {
      id: entry.id as UUID,
      agentId: input.context.runtime.agentId,
      entityId: steerTurn.entityId as UUID,
      roomId: steerTurn.roomId as UUID,
      content: { text: entry.text },
    };
    channel.markSubmissionPersisted(entry, memory);
    return {
      accepted: true,
      runId: channel.runId,
      sessionId: channel.sessionId,
      messageId: entry.id,
      delivery: "next-continuation-pass",
    };
  } catch (error) {
    channel.abandonSubmission(entry);
    input.context.runtime.logger?.warn(
      {
        error,
        runId: channel.runId,
        sessionId: channel.sessionId,
        steerMessageId: entry.id,
      },
      "Unable to persist user steer message",
    );
    return rejection(
      "steer_persistence_failed",
      "The steer message could not be durably persisted, so it was not admitted.",
    );
  }
}
