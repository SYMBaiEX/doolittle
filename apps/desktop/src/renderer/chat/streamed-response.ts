export interface StreamedResponsePayload {
  delta?: unknown;
  response?: unknown;
  part_id?: unknown;
  sequence?: unknown;
}

/** Protocol identity used to suppress duplicate frames across replay/reconnect. */
export function streamedResponseFrameKey(
  payload: StreamedResponsePayload,
): string | undefined {
  return typeof payload.part_id === "string" &&
    Number.isSafeInteger(payload.sequence)
    ? `${payload.part_id}:${String(payload.sequence)}`
    : undefined;
}

/**
 * Reconcile streamed prose with the server's authoritative response snapshot.
 * Older desktop/agent pairs only send `delta`, so that path remains append-only.
 */
export function reconcileStreamedResponse(
  current: string,
  payload: StreamedResponsePayload,
): string {
  if (typeof payload.response === "string") return payload.response;
  return `${current}${typeof payload.delta === "string" ? payload.delta : ""}`;
}

export function completedResponseText(
  current: string,
  payload: { response?: unknown },
): string {
  return typeof payload.response === "string" && payload.response
    ? payload.response
    : current || "Done.";
}
