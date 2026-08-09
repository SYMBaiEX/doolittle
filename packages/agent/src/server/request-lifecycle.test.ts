import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { createRequestAbortController } from "./request-lifecycle";

function createTransport(): {
  incoming: IncomingMessage;
  outgoing: ServerResponse;
  closeResponse: (writableEnded: boolean) => void;
} {
  const incoming = new EventEmitter() as IncomingMessage;
  const outgoing = new EventEmitter() as ServerResponse;
  return {
    incoming,
    outgoing,
    closeResponse: (writableEnded) => {
      Object.defineProperty(outgoing, "writableEnded", {
        configurable: true,
        value: writableEnded,
      });
      outgoing.emit("close");
    },
  };
}

describe("createRequestAbortController", () => {
  it("aborts route work when the request or socket is disconnected", () => {
    const requestTransport = createTransport();
    const requestLifecycle = createRequestAbortController(
      requestTransport.incoming,
      requestTransport.outgoing,
    );
    requestTransport.incoming.emit("aborted");
    expect(requestLifecycle.controller.signal.aborted).toBe(true);
    requestLifecycle.dispose();

    const responseTransport = createTransport();
    const responseLifecycle = createRequestAbortController(
      responseTransport.incoming,
      responseTransport.outgoing,
    );
    responseTransport.closeResponse(false);
    expect(responseLifecycle.controller.signal.aborted).toBe(true);
    responseLifecycle.dispose();
  });

  it("does not treat a completed response close as cancellation", () => {
    const transport = createTransport();
    const lifecycle = createRequestAbortController(
      transport.incoming,
      transport.outgoing,
    );

    transport.closeResponse(true);

    expect(lifecycle.controller.signal.aborted).toBe(false);
    lifecycle.dispose();
  });
});
