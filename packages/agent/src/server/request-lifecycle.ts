import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Bridges a Node transport closing unexpectedly to the Web Request signal
 * consumed by route handlers. A normal, fully written response also emits
 * `close`, so only treat it as cancellation before `writableEnded`.
 */
export function createRequestAbortController(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
): { controller: AbortController; dispose: () => void } {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };
  const abortOnResponseClose = () => {
    if (!outgoing.writableEnded) {
      abort();
    }
  };

  incoming.once("aborted", abort);
  outgoing.once("close", abortOnResponseClose);
  outgoing.once("error", abort);

  return {
    controller,
    dispose: () => {
      incoming.off("aborted", abort);
      outgoing.off("close", abortOnResponseClose);
      outgoing.off("error", abort);
    },
  };
}
