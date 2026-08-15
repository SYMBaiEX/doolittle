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
): GatewayReceiveOutcome {
  const { idempotencyDisposition: _, ...publicOutcome } = outcome;
  return publicOutcome;
}

function duplicateGatewayReceiveOutcome(
  outcome: GatewayReceiveOutcome,
): GatewayReceiveOutcome {
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

/** Coordinates one execution per durable upstream message identity. */
export class GatewayReceiveIdempotencyCoordinator {
  private readonly inFlight = new Map<string, Promise<GatewayReceiveOutcome>>();
  private readonly completed = new Map<string, GatewayReceiveOutcome>();

  constructor(private readonly store: GatewayReceiveIdempotencyStore) {}

  receive(
    message: IncomingPlatformMessage,
    execute: () => Promise<GatewayReceiveOutcome>,
  ): Promise<GatewayReceiveOutcome> {
    const idempotencyKey = gatewayInboundIdempotencyKey(message);
    if (!idempotencyKey) return execute();

    const inMemory = this.completed.get(idempotencyKey);
    const stored = inMemory
      ? undefined
      : this.store.findOutcome(idempotencyKey);
    const completed =
      inMemory ?? (stored ? durableGatewayReceiveOutcome(stored) : undefined);
    if (completed) {
      this.completed.set(idempotencyKey, completed);
      return Promise.resolve(duplicateGatewayReceiveOutcome(completed));
    }

    const active = this.inFlight.get(idempotencyKey);
    if (active) return active.then(duplicateGatewayReceiveOutcome);

    const execution = Promise.resolve()
      .then(execute)
      .then((outcome) => {
        const durableOutcome = durableGatewayReceiveOutcome(outcome);
        if (durableOutcome) {
          this.completed.set(idempotencyKey, durableOutcome);
          this.store.recordOutcome(message, idempotencyKey, durableOutcome);
        }
        return publicGatewayReceiveOutcome(outcome);
      })
      .finally(() => {
        if (this.inFlight.get(idempotencyKey) === execution) {
          this.inFlight.delete(idempotencyKey);
        }
      });
    this.inFlight.set(idempotencyKey, execution);
    return execution;
  }
}
