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

export interface BufferedResponse {
  replace: boolean;
  text: string;
}

/** Preserve an authoritative snapshot and any following append-only frames. */
export function bufferStreamedResponse(
  previous: BufferedResponse | undefined,
  payload: StreamedResponsePayload,
): BufferedResponse {
  if (typeof payload.response === "string")
    return { replace: true, text: payload.response };
  const delta = typeof payload.delta === "string" ? payload.delta : "";
  return {
    replace: previous?.replace ?? false,
    text: (previous?.text ?? "") + delta,
  };
}

export function completedResponseText(
  current: string,
  response: unknown,
): string {
  return typeof response === "string" && response
    ? response
    : current || "Done.";
}
