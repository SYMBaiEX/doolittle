import { createServer, type ServerResponse } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import {
  fetchPlatform,
  readPlatformResponseText,
} from "../../packages/agent/src/gateway/platforms/platform-http";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function upstream() {
  let pending: ServerResponse | undefined;
  const server = createServer((request, response) => {
    if (request.url === "/ok") {
      response.end('{"ok":true}');
    } else if (request.url === "/empty") {
      response.writeHead(204).end();
    } else if (request.url === "/withhold-headers") {
      return;
    } else {
      pending = response;
      response.writeHead(200, { "content-type": "application/json" });
      response.flushHeaders();
      response.write("{");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing server address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    finish: () => pending?.end('"ok":true}'),
  };
}

async function bounded<T>(read: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Body read did not time out")),
          1000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

it("starts the deadline before response headers arrive", async () => {
  const { url } = await upstream();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const request = expect(
    bounded(fetchPlatform(`${url}/withhold-headers`, { timeoutMs: 100 })),
  ).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(1000);
  await request;
});

it.each(["json", "diagnostic"])(
  "times out a stalled %s body after headers arrive",
  async (read) => {
    const { url } = await upstream();
    // The deadline is part of the behavior under test. Keep it independent
    // from connection setup latency, which varies widely on saturated CI
    // runners before response headers can even arrive.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const response = await fetchPlatform(url, { timeoutMs: 100 });
    const body = expect(
      bounded(
        read === "json" ? response.json() : readPlatformResponseText(response),
      ),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(1000);
    await body;
  },
);

it("keeps caller cancellation active through the body", async () => {
  const { url } = await upstream();
  const caller = new AbortController();
  const response = await fetchPlatform(url, {
    timeoutMs: 5000,
    signal: caller.signal,
  });
  const read = bounded(response.text());
  caller.abort(new DOMException("Caller cancelled", "AbortError"));
  await expect(read).rejects.toMatchObject({ name: "AbortError" });
});

it("allows explicitly untimed streams to finish later", async () => {
  const { url, finish } = await upstream();
  const response = await fetchPlatform(url, { timeoutMs: false });
  finish();
  await expect(response.json()).resolves.toEqual({ ok: true });
});

it.each(["ok", "empty", "cancel"])(
  "releases caller listeners after %s",
  async (mode) => {
    const { url } = await upstream();
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, "removeEventListener");
    const response = await fetchPlatform(`${url}/${mode}`, {
      timeoutMs: 5000,
      signal: caller.signal,
    });
    if (mode === "cancel") await response.body?.cancel();
    else await response.text();
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    if (mode === "ok") expect(response.url).toBe(`${url}/ok`);
  },
);

it("releases caller listeners at the deadline even if the body is ignored", async () => {
  const { url } = await upstream();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const caller = new AbortController();
  const remove = vi.spyOn(caller.signal, "removeEventListener");
  await fetchPlatform(url, { timeoutMs: 100, signal: caller.signal });
  await vi.advanceTimersByTimeAsync(150);
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});
