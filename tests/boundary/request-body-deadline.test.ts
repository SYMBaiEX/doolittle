import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import {
  RequestBodyTimeoutError,
  readBoundedRequestBody,
} from "../../packages/agent/src/server/request-body";

afterEach(() => {
  vi.useRealTimers();
});

it("pauses an incomplete upload at the deadline and leaves the socket available for an HTTP error", async () => {
  vi.useFakeTimers();
  const socket = new Socket();
  const request = new IncomingMessage(socket);
  request.headers["transfer-encoding"] = "chunked";
  const pause = vi.spyOn(request, "pause");
  try {
    const timedOut = expect(
      readBoundedRequestBody(request, 16, 50),
    ).rejects.toEqual(new RequestBodyTimeoutError(50));

    await vi.advanceTimersByTimeAsync(50);
    await timedOut;
    expect(pause).toHaveBeenCalled();
    expect(socket.destroyed).toBe(false);
    expect(request.destroyed).toBe(false);
  } finally {
    request.destroy();
    socket.destroy();
  }
});

it("clears the upload deadline when the request body arrives", async () => {
  vi.useFakeTimers();
  const socket = new Socket();
  const request = new IncomingMessage(socket);
  request.headers["content-length"] = "4";
  request.push(Buffer.from("body"));
  request.push(null);
  try {
    await expect(readBoundedRequestBody(request, 16, 50)).resolves.toEqual(
      Buffer.from("body"),
    );
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    request.destroy();
    socket.destroy();
  }
});
