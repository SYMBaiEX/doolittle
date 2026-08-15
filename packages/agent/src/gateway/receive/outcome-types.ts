export type GatewayDeliveryStatus = "sent" | "fallback" | "rejected";

export type GatewayIdempotencyDisposition = "terminal" | "transient";

export const GATEWAY_PAIRING_RETRY_RESPONSE =
  "Authorization is pending. Retry this message after pairing is approved.";

export interface GatewayReceiveOutcome {
  ok: boolean;
  response: string;
  pairingCode?: string;
  traceId?: string;
  sessionId?: string;
  deliveryId?: string;
  runSessionId?: string;
  agentCompleted?: boolean;
  deliveryStatus?: GatewayDeliveryStatus;
  deliveryFailure?: string;
  outboxRecordId?: string;
  /** True when returning a bounded acknowledgement for an in-flight or durable prior call. */
  duplicate?: boolean;
  /** Internal marker used to decide whether an outcome is safe to retain. */
  idempotencyDisposition?: GatewayIdempotencyDisposition;
}
