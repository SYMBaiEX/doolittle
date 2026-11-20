import { setTimeout } from "node:timers/promises";
import { SseParser } from "../../shared/sse";
import { parseRequestError } from "./runtime-http";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 25;
const terminalEvents = new Set([
  "response.completed",
  "response.failed",
  "response.cancelled",
  "cancelled",
  "error",
]);

export async function followChatEventStream({
  runtimeUrl,
  requestId,
  after = 0,
  signal,
  fetchRuntime,
  onEvent,
}: {
  runtimeUrl: string;
  requestId: string;
  after?: number;
  signal: AbortSignal;
  fetchRuntime: typeof fetch;
  onEvent(
    frame: { event: string; data: unknown },
    id: number | undefined,
    terminal: boolean,
  ): void;
}): Promise<void> {
  let cursor = after;
  const consume = (frame: { event: string; data: unknown }) => {
    const id =
      frame.data && typeof frame.data === "object" && "event_id" in frame.data
        ? frame.data.event_id
        : undefined;
    const eventId =
      typeof id === "number" && Number.isSafeInteger(id) ? id : undefined;
    if (frame.event === "error" && eventId === undefined) {
      throw new Error("The runtime could not deliver the chat stream.");
    }
    if (eventId !== undefined) {
      if (eventId <= cursor) return false;
      cursor = eventId;
    }
    const terminal = terminalEvents.has(frame.event);
    onEvent(frame, eventId, terminal);
    return terminal;
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    signal.throwIfAborted();
    const url = `${runtimeUrl}/chat/runs/${encodeURIComponent(requestId)}/events?after=${cursor}`;
    let retryable = true;
    try {
      const response = await fetchRuntime(url, { signal });
      if (!response.ok) {
        retryable = response.status >= 500;
        throw new Error(await parseRequestError(response));
      }
      if (!response.body)
        throw new Error("The runtime returned an empty stream.");
      const parser = new SseParser();
      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (
            parser
              .push(decoder.decode(chunk.value, { stream: true }))
              .some(consume)
          )
            return;
        }
        if (
          parser.push(decoder.decode()).some(consume) ||
          parser.finish().some(consume)
        )
          return;
      } finally {
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      throw new Error(
        "The runtime closed the chat stream before completing the response.",
      );
    } catch (error) {
      if (!retryable || signal.aborted) throw error;
      if (attempt === MAX_ATTEMPTS)
        throw new Error(
          "Connection to the chat response was lost. Reconnect to continue watching it.",
          { cause: error },
        );
      await setTimeout(RETRY_DELAY_MS * attempt, undefined, { signal });
    }
  }
}
