export interface StreamedResponsePayload {
  delta?: unknown;
  response?: unknown;
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
