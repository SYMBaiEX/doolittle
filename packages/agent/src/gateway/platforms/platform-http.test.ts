import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlatform, readPlatformResponseText } from "./platform-http";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("fetchPlatform", () => {
  it("uses a finite default deadline and aborts the request when it expires", async () => {
    vi.useFakeTimers();
    let receivedSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          receivedSignal = init?.signal ?? undefined;
          receivedSignal?.addEventListener("abort", () => {
            reject(receivedSignal?.reason);
          });
        }),
    ) as typeof fetch;

    const request = fetchPlatform("https://platform.test/webhook");
    const expectedTimeout = expect(request).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(15_000);

    await expectedTimeout;
    expect(receivedSignal?.aborted).toBe(true);
  });

  it("forwards caller aborts and removes the caller listener after completion", async () => {
    vi.useFakeTimers();
    const callerController = new AbortController();
    const addListener = vi.spyOn(callerController.signal, "addEventListener");
    const removeListener = vi.spyOn(
      callerController.signal,
      "removeEventListener",
    );
    globalThis.fetch = vi.fn(async () => new Response("ok")) as typeof fetch;

    await fetchPlatform("https://platform.test/webhook", {
      signal: callerController.signal,
    });

    expect(addListener).toHaveBeenCalledWith("abort", expect.any(Function), {
      once: true,
    });
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);

    let requestSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          requestSignal = init?.signal ?? undefined;
          requestSignal?.addEventListener("abort", () =>
            reject(requestSignal?.reason),
          );
        }),
    ) as typeof fetch;
    const reason = new Error("caller stopped the request");
    const request = fetchPlatform("https://platform.test/webhook", {
      signal: callerController.signal,
      timeoutMs: false,
    });
    const expectedAbort = expect(request).rejects.toBe(reason);
    callerController.abort(reason);

    await expectedAbort;
    expect(requestSignal?.reason).toBe(reason);
  });
});

describe("readPlatformResponseText", () => {
  it("does not label an exact-limit response as truncated", async () => {
    await expect(
      readPlatformResponseText(new Response("abcd"), 4),
    ).resolves.toBe("abcd");
  });

  it("caps diagnostic text and cancels the unread response body", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("abcdefgh"));
      },
      cancel,
    });
    const response = new Response(body);

    await expect(readPlatformResponseText(response, 4)).resolves.toBe(
      "abcd\n[response body truncated]",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
});
