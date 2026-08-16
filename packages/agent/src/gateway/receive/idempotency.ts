import type { IncomingPlatformMessage } from "@/types/gateway";
import {
  GATEWAY_PAIRING_RETRY_RESPONSE,
  type GatewayReceiveOutcome,
} from "./outcome-types";

export const GATEWAY_DUPLICATE_ACK_RESPONSE =
  "This message was already processed. No duplicate agent run was started.";

export const GATEWAY_DELIVERY_PENDING_RESPONSE =
  "The response was computed, but delivery is pending retry.";

function publicGatewayReceiveOutcome(
  outcome: GatewayReceiveOutcome,
  preserveIdempotencyDisposition = false,
): GatewayReceiveOutcome {
  if (preserveIdempotencyDisposition) return outcome;
  const { idempotencyDisposition: _, ...publicOutcome } = outcome;
  return publicOutcome;
}

function duplicateGatewayReceiveOutcome(
  outcome: GatewayReceiveOutcome,
  preserveIdempotencyDisposition = false,
): GatewayReceiveOutcome {
  if (preserveIdempotencyDisposition) {
    return { ...outcome, duplicate: true };
  }
  const { pairingCode: _, ...publicOutcome } =
    publicGatewayReceiveOutcome(outcome);
  const isPairingOutcome =
    Boolean(outcome.pairingCode?.trim()) ||
    outcome.response === GATEWAY_PAIRING_RETRY_RESPONSE;
  return {
    ...publicOutcome,
    response: isPairingOutcome
      ? GATEWAY_PAIRING_RETRY_RESPONSE
      : outcome.deliveryStatus === "rejected"
        ? GATEWAY_DELIVERY_PENDING_RESPONSE
        : GATEWAY_DUPLICATE_ACK_RESPONSE,
    duplicate: true,
  };
}

function durableGatewayReceiveOutcome(
  outcome: GatewayReceiveOutcome,
): GatewayReceiveOutcome | undefined {
  const isPairingOutcome =
    Boolean(outcome.pairingCode?.trim()) ||
    outcome.response === GATEWAY_PAIRING_RETRY_RESPONSE;
  if (
    !outcome.agentCompleted &&
    outcome.idempotencyDisposition !== "terminal" &&
    !isPairingOutcome
  ) {
    return undefined;
  }

  const {
    pairingCode: _,
    duplicate: _duplicate,
    idempotencyDisposition: _disposition,
    ...durableFields
  } = outcome;
  return {
    ...durableFields,
    response: isPairingOutcome
      ? GATEWAY_PAIRING_RETRY_RESPONSE
      : outcome.deliveryStatus === "rejected"
        ? GATEWAY_DELIVERY_PENDING_RESPONSE
        : GATEWAY_DUPLICATE_ACK_RESPONSE,
    idempotencyDisposition: "terminal",
  };
}

export function gatewayInboundIdempotencyKey(
  message: IncomingPlatformMessage,
): string | undefined {
  const messageId = message.messageId?.trim();
  if (!messageId) return undefined;
  return JSON.stringify([
    message.platform,
    message.metadata?.accountId?.trim() || "default",
    message.userId,
    message.roomId,
    message.channelId ?? "",
    message.threadId ?? "",
    messageId,
  ]);
}

export interface GatewayReceiveIdempotencyStore {
  findOutcome(idempotencyKey: string): GatewayReceiveOutcome | undefined;
  recordOutcome(
    message: IncomingPlatformMessage,
    idempotencyKey: string,
    outcome: GatewayReceiveOutcome,
  ): void;
}

export interface GatewayReceiveIdempotencyOptions {
  /**
   * The initiating transport's lifetime. Each delivery gets its own consumer
   * lease; the coordinated run is cancelled only after every lease ends.
   */
  abortSignal?: AbortSignal;
  /** Internal ingress-only marker; not part of provider-facing results. */
  preserveIdempotencyDisposition?: boolean;
}

interface InFlightGatewayReceive {
  controller: AbortController;
  consumers: Set<GatewayReceiveConsumer>;
  execution: Promise<GatewayReceiveOutcome>;
}

interface GatewayReceiveConsumer {
  abortSignal: AbortSignal | undefined;
  removeAbortListener: () => void;
  released: boolean;
}

/** Coordinates one execution per durable upstream message identity. */
export class GatewayReceiveIdempotencyCoordinator {
  private readonly inFlight = new Map<string, InFlightGatewayReceive>();
  private readonly completed = new Map<string, GatewayReceiveOutcome>();

  constructor(private readonly store: GatewayReceiveIdempotencyStore) {}

  receive(
    message: IncomingPlatformMessage,
    execute: (abortSignal: AbortSignal) => Promise<GatewayReceiveOutcome>,
    options?: GatewayReceiveIdempotencyOptions,
  ): Promise<GatewayReceiveOutcome> {
    if (options?.abortSignal?.aborted) {
      return Promise.reject(options.abortSignal.reason);
    }
    const idempotencyKey = gatewayInboundIdempotencyKey(message);
    if (!idempotencyKey)
      return execute(options?.abortSignal ?? new AbortController().signal);

    const inMemory = this.completed.get(idempotencyKey);
    const stored = inMemory
      ? undefined
      : this.store.findOutcome(idempotencyKey);
    const completed =
      inMemory ?? (stored ? durableGatewayReceiveOutcome(stored) : undefined);
    if (completed) {
      this.completed.set(idempotencyKey, completed);
      return Promise.resolve(
        duplicateGatewayReceiveOutcome(
          completed,
          options?.preserveIdempotencyDisposition,
        ),
      );
    }

    const active = this.inFlight.get(idempotencyKey);
    if (active) {
      return this.join(active, options).then((outcome) =>
        duplicateGatewayReceiveOutcome(
          outcome,
          options?.preserveIdempotencyDisposition,
        ),
      );
    }

    const controller = new AbortController();
    const inFlight = {
      controller,
      consumers: new Set<GatewayReceiveConsumer>(),
      execution: undefined as unknown as Promise<GatewayReceiveOutcome>,
    } satisfies InFlightGatewayReceive;
    const execution = Promise.resolve()
      .then(() => execute(controller.signal))
      .then((outcome) => {
        const durableOutcome = durableGatewayReceiveOutcome(outcome);
        if (durableOutcome) {
          this.completed.set(idempotencyKey, durableOutcome);
          this.store.recordOutcome(message, idempotencyKey, durableOutcome);
        }
        return outcome;
      })
      .finally(() => {
        if (this.inFlight.get(idempotencyKey) === inFlight) {
          this.inFlight.delete(idempotencyKey);
        }
        for (const consumer of inFlight.consumers) {
          consumer.removeAbortListener();
        }
        inFlight.consumers.clear();
      });
    inFlight.execution = execution;
    this.inFlight.set(idempotencyKey, inFlight);
    return this.join(inFlight, options).then((outcome) =>
      publicGatewayReceiveOutcome(
        outcome,
        options?.preserveIdempotencyDisposition,
      ),
    );
  }

  private join(
    inFlight: InFlightGatewayReceive,
    options: GatewayReceiveIdempotencyOptions | undefined,
  ): Promise<GatewayReceiveOutcome> {
    const consumer: GatewayReceiveConsumer = {
      abortSignal: options?.abortSignal,
      removeAbortListener: () => undefined,
      released: false,
    };
    const release = (aborted: boolean) => {
      if (consumer.released) return;
      consumer.released = true;
      consumer.removeAbortListener();
      inFlight.consumers.delete(consumer);
      if (
        aborted &&
        inFlight.consumers.size === 0 &&
        !inFlight.controller.signal.aborted
      ) {
        inFlight.controller.abort(consumer.abortSignal?.reason);
      }
    };
    const onAbort = () => release(true);
    if (consumer.abortSignal) {
      if (consumer.abortSignal.aborted) {
        release(true);
      } else {
        consumer.abortSignal.addEventListener("abort", onAbort, { once: true });
        consumer.removeAbortListener = () =>
          consumer.abortSignal?.removeEventListener("abort", onAbort);
        inFlight.consumers.add(consumer);
      }
    } else {
      inFlight.consumers.add(consumer);
    }
    return inFlight.execution.finally(() => release(false));
  }
}
