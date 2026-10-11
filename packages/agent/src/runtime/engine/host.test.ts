import { EventEmitter } from "node:events";
import { Worker, type WorkerOptions } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installSharedEngineHost } from "./host";
import {
  ENGINE_HOST_PROTOCOL,
  ENGINE_PROTOCOL,
  ENGINE_WORKER_PROTOCOL,
  WORKER_HOST_PROTOCOL,
} from "./protocol";

const requestId = (tail: number) =>
  `00000000-0000-4000-8000-${String(tail).padStart(12, "0")}`;
const ready = (botId: string) => ({
  url: "http://127.0.0.1:3456",
  agentId: requestId(99),
  name: botId,
  botId,
});

class FakeWorker extends EventEmitter {
  messages: unknown[] = [];
  postMessage(value: unknown) {
    this.messages.push(value);
  }
  async terminate() {
    this.emit("exit", 1);
    return 1;
  }
}

function fixture(
  options: {
    maxConcurrentStarts?: number;
    maxWorkers?: number;
    onDiagnostic?: (event: { botId: string; code: string }) => void;
  } = {},
) {
  const ipc = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>;
  };
  ipc.send = vi.fn();
  const workers: FakeWorker[] = [];
  const workerOptions: WorkerOptions[] = [];
  const host = installSharedEngineHost("file:///tmp/doolittle-index.ts", {
    enabled: true,
    ipc: ipc as never,
    ...options,
    workerFactory: (_entry, options) => {
      workerOptions.push(options);
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as never;
    },
    stopTimeoutMs: 10,
  });
  const start = (botId: string, id: number, environment = { FOO: botId }) => {
    ipc.emit("message", {
      protocol: ENGINE_PROTOCOL,
      id: requestId(id),
      operation: "start",
      botId,
      environment,
    });
  };
  const stop = (botId: string, id: number) => {
    ipc.emit("message", {
      protocol: ENGINE_PROTOCOL,
      id: requestId(id),
      operation: "stop",
      botId,
    });
  };
  return { ipc, workers, workerOptions, host, start, stop };
}

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

afterEach(() => vi.useRealTimers());

describe("shared engine host", () => {
  it("admits 50 isolated tiny Node workers with at most two bootstraps at once", async () => {
    const ipc = new EventEmitter() as EventEmitter & {
      send: ReturnType<typeof vi.fn>;
    };
    ipc.send = vi.fn();
    let created = 0;
    let activeBoots = 0;
    let peakBoots = 0;
    const source = `
      const { parentPort, workerData, threadId } = require('node:worker_threads');
      setTimeout(() => parentPort.postMessage({
        protocol: 'doolittle-engine-worker-v1', type: 'ready',
        ready: {
          url: 'http://127.0.0.1:3456',
          agentId: '${requestId(99)}',
          name: process.env.BOT_ID + ':' + Object.keys(process.env).sort().join(','),
          botId: workerData.botId,
          pid: process.pid,
          threadId,
        },
      }), 5);
      parentPort.on('message', (message) => {
        if (message?.type === 'shutdown') process.exit(0);
      });
    `;
    const host = installSharedEngineHost("file:///tmp/doolittle-index.ts", {
      enabled: true,
      ipc: ipc as never,
      maxWorkers: 50,
      maxConcurrentStarts: 2,
      workerFactory: (_entry, options) => {
        created++;
        activeBoots++;
        peakBoots = Math.max(peakBoots, activeBoots);
        const worker = new Worker(source, { ...options, eval: true });
        worker.on("message", (value: unknown) => {
          if (
            typeof value === "object" &&
            value !== null &&
            "type" in value &&
            value.type === "ready"
          )
            activeBoots--;
        });
        return worker;
      },
      stopTimeoutMs: 1_000,
    });
    try {
      for (let index = 0; index < 50; index++) {
        const botId = `bot-${index}`;
        ipc.emit("message", {
          protocol: ENGINE_PROTOCOL,
          id: requestId(index + 1),
          operation: "start",
          botId,
          environment: { BOT_ID: botId },
        });
      }
      expect(created).toBe(2);
      await vi.waitFor(
        () => {
          const successes = ipc.send.mock.calls.filter(
            ([message]) =>
              message?.protocol === ENGINE_PROTOCOL && message.ok === true,
          );
          expect(successes).toHaveLength(50);
        },
        { timeout: 25_000, interval: 20 },
      );
      const results = ipc.send.mock.calls
        .map(([message]) => message)
        .filter(
          (message) =>
            message?.protocol === ENGINE_PROTOCOL && message.ok === true,
        )
        .map(
          (message) =>
            message.result as {
              botId: string;
              name: string;
              pid: number;
              threadId: number;
            },
        );
      expect(created).toBe(50);
      expect(peakBoots).toBe(2);
      expect(activeBoots).toBe(0);
      expect(results.every((result) => result.pid === process.pid)).toBe(true);
      expect(
        results.every(
          (result) => Number.isInteger(result.threadId) && result.threadId > 0,
        ),
      ).toBe(true);
      expect(new Set(results.map((result) => result.threadId)).size).toBe(50);
      expect(
        results.every((result) => result.name === `${result.botId}:BOT_ID`),
      ).toBe(true);
    } finally {
      await host?.stopAll();
    }
  }, 30_000);

  it("keeps 50 slow queued starts bounded to two active bootstraps", async () => {
    vi.useFakeTimers();
    const f = fixture({ maxWorkers: 50, maxConcurrentStarts: 2 });
    for (let index = 0; index < 50; index++) f.start(`bot-${index}`, index + 1);
    expect(f.workers).toHaveLength(2);
    for (let wave = 0; wave < 25; wave++) {
      await vi.advanceTimersByTimeAsync(30_000);
      for (let offset = 0; offset < 2; offset++) {
        const index = wave * 2 + offset;
        f.workers[index]?.emit("message", {
          protocol: ENGINE_WORKER_PROTOCOL,
          type: "ready",
          ready: ready(`bot-${index}`),
        });
      }
      await vi.advanceTimersByTimeAsync(0);
      expect(f.workers).toHaveLength(Math.min(50, (wave + 2) * 2));
    }
    expect(
      f.ipc.send.mock.calls.filter(
        ([message]) => message?.protocol === ENGINE_PROTOCOL && message.ok,
      ),
    ).toHaveLength(50);
    for (const worker of f.workers) worker.emit("exit", 0);
    await f.host?.stopAll();
  });

  it("runs two real Node workers with separate exact environments", async () => {
    const ipc = new EventEmitter() as EventEmitter & {
      send: ReturnType<typeof vi.fn>;
    };
    ipc.send = vi.fn();
    const source = `
      const { parentPort, workerData } = require('node:worker_threads');
      parentPort.postMessage({
        protocol: 'doolittle-engine-worker-v1', type: 'ready',
        ready: {
          url: 'http://127.0.0.1:3456',
          agentId: '${requestId(99)}',
          name: process.env.FOO + ':' + Object.keys(process.env).sort().join(','),
          botId: workerData.botId,
        },
      });
      parentPort.on('message', () => process.exit(0));
    `;
    const host = installSharedEngineHost("file:///tmp/doolittle-index.ts", {
      enabled: true,
      ipc: ipc as never,
      workerFactory: (_entry, options) =>
        new Worker(source, { ...options, eval: true }),
      stopTimeoutMs: 1_000,
    });
    for (const [botId, id] of [
      ["bot-one", 1],
      ["bot-two", 2],
    ] as const) {
      ipc.emit("message", {
        protocol: ENGINE_PROTOCOL,
        id: requestId(id),
        operation: "start",
        botId,
        environment: { FOO: botId },
      });
    }
    await vi.waitFor(() => {
      expect(ipc.send).toHaveBeenCalledWith({
        protocol: ENGINE_PROTOCOL,
        id: requestId(1),
        ok: true,
        result: { ...ready("bot-one"), name: "bot-one:FOO" },
      });
      expect(ipc.send).toHaveBeenCalledWith({
        protocol: ENGINE_PROTOCOL,
        id: requestId(2),
        ok: true,
        result: { ...ready("bot-two"), name: "bot-two:FOO" },
      });
    });
    await host?.stopAll();
  });

  it("coalesces same-bot starts and attests worker RPC identity", async () => {
    const f = fixture();
    f.start("bot-one", 1);
    f.start("bot-one", 2);
    expect(f.workers).toHaveLength(1);
    expect(f.workerOptions[0]).toMatchObject({
      argv: ["api"],
      env: { FOO: "bot-one" },
      workerData: { doolittleEngineWorker: true, botId: "bot-one" },
    });
    f.workers[0]?.emit("message", {
      protocol: ENGINE_WORKER_PROTOCOL,
      type: "ready",
      ready: ready("bot-one"),
    });
    await flush();
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_PROTOCOL,
      id: requestId(1),
      ok: true,
      result: ready("bot-one"),
    });
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_PROTOCOL,
      id: requestId(2),
      ok: true,
      result: ready("bot-one"),
    });
    f.workers[0]?.emit("message", {
      protocol: ENGINE_WORKER_PROTOCOL,
      type: "host-message",
      message: {
        protocol: WORKER_HOST_PROTOCOL,
        id: requestId(3),
        sequence: 1,
        botId: "impersonated",
        operation: "codex.auth",
      },
    });
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_HOST_PROTOCOL,
      botId: "bot-one",
      message: {
        protocol: WORKER_HOST_PROTOCOL,
        id: requestId(3),
        sequence: 1,
        botId: "bot-one",
        operation: "codex.auth",
      },
    });
    f.ipc.emit("message", {
      protocol: ENGINE_HOST_PROTOCOL,
      botId: "bot-one",
      message: {
        protocol: WORKER_HOST_PROTOCOL,
        id: requestId(3),
        sequence: 1,
        botId: "impersonated",
        ok: true,
      },
    });
    expect(f.workers[0]?.messages).toContainEqual({
      protocol: ENGINE_WORKER_PROTOCOL,
      type: "host-message",
      message: {
        protocol: WORKER_HOST_PROTOCOL,
        id: requestId(3),
        sequence: 1,
        botId: "bot-one",
        ok: true,
      },
    });
    f.ipc.emit("message", {
      protocol: ENGINE_HOST_PROTOCOL,
      botId: "bot-one",
      message: {
        protocol: WORKER_HOST_PROTOCOL,
        id: requestId(3),
        sequence: 1,
        ok: true,
      },
    });
    expect(f.workers[0]?.messages).toHaveLength(1);
    f.workers[0]?.emit("message", {
      protocol: ENGINE_WORKER_PROTOCOL,
      type: "host-message",
      message: {
        protocol: WORKER_HOST_PROTOCOL,
        id: requestId(3),
        sequence: 1,
        ack: true,
        botId: "impersonated",
      },
    });
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_HOST_PROTOCOL,
      botId: "bot-one",
      message: {
        protocol: WORKER_HOST_PROTOCOL,
        id: requestId(3),
        sequence: 1,
        ack: true,
        botId: "bot-one",
      },
    });
    await f.host?.stopAll();
  });

  it("limits concurrent bootstrap, rejects configuration changes, and stops only the addressed bot", async () => {
    const f = fixture({ maxConcurrentStarts: 1, maxWorkers: 2 });
    f.start("bot-one", 1);
    f.start("bot-two", 2);
    f.start("bot-one", 3, { FOO: "changed" });
    f.start("bot-three", 4);
    await flush();
    expect(f.workers).toHaveLength(1);
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_PROTOCOL,
      id: requestId(3),
      ok: false,
      error: "The named engine is running with a different configuration.",
    });
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_PROTOCOL,
      id: requestId(4),
      ok: false,
      error: "The shared engine is at capacity.",
    });
    f.workers[0]?.emit("message", {
      protocol: ENGINE_WORKER_PROTOCOL,
      type: "ready",
      ready: ready("bot-one"),
    });
    await flush();
    expect(f.workers).toHaveLength(2);
    f.stop("bot-one", 5);
    expect(f.workers[0]?.messages).toContainEqual({
      protocol: ENGINE_WORKER_PROTOCOL,
      type: "shutdown",
    });
    expect(f.workers[1]?.messages).toEqual([]);
    f.workers[0]?.emit("exit", 0);
    await flush();
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_PROTOCOL,
      id: requestId(5),
      ok: true,
      result: undefined,
    });
    expect(
      f.ipc.send.mock.calls.filter(
        ([message]) => message?.event === "bot-exit",
      ),
    ).toHaveLength(0);
    await f.host?.stopAll();
  });

  it("rejects canceled startup and does not replace a live stopping worker", async () => {
    const f = fixture();
    f.start("bot-one", 1);
    f.stop("bot-one", 2);
    f.start("bot-one", 3);
    await flush();
    expect(f.workers).toHaveLength(1);
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_PROTOCOL,
      id: requestId(1),
      ok: false,
      error: "The named engine could not start.",
    });
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_PROTOCOL,
      id: requestId(3),
      ok: false,
      error: "The named engine stopped before it became ready.",
    });
    f.workers[0]?.emit("exit", 0);
    await flush();
    f.start("bot-one", 4);
    expect(f.workers).toHaveLength(2);
    await f.host?.stopAll();
  });

  it("confirms a queued stop without ever constructing its worker", async () => {
    const f = fixture({ maxConcurrentStarts: 1 });
    f.start("bot-one", 1);
    f.start("bot-two", 2);
    expect(f.workers).toHaveLength(1);
    f.stop("bot-two", 3);
    await flush();
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_PROTOCOL,
      id: requestId(2),
      ok: false,
      error: "The named engine could not start.",
    });
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_PROTOCOL,
      id: requestId(3),
      ok: true,
      result: undefined,
    });
    f.workers[0]?.emit("message", {
      protocol: ENGINE_WORKER_PROTOCOL,
      type: "ready",
      ready: ready("bot-one"),
    });
    await flush();
    expect(f.workers).toHaveLength(1);
    f.workers[0]?.emit("exit", 0);
    await f.host?.stopAll();
  });

  it("drops unknown host replies and reports unexpected bot exit", async () => {
    const f = fixture();
    f.start("bot-one", 1);
    f.workers[0]?.emit("message", {
      protocol: ENGINE_WORKER_PROTOCOL,
      type: "ready",
      ready: ready("bot-one"),
    });
    await flush();
    f.ipc.emit("message", {
      protocol: ENGINE_HOST_PROTOCOL,
      botId: "bot-one",
      message: {
        protocol: WORKER_HOST_PROTOCOL,
        id: requestId(70),
        sequence: 1,
        ok: true,
      },
    });
    expect(f.workers[0]?.messages).toEqual([]);
    f.workers[0]?.emit("exit", 1);
    await flush();
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_PROTOCOL,
      event: "bot-exit",
      botId: "bot-one",
    });
  });

  it("classifies a worker module error without exposing its message", async () => {
    const onDiagnostic = vi.fn();
    const f = fixture({ onDiagnostic });
    f.start("bot-one", 1);
    f.workers[0]?.emit(
      "error",
      new Error("ERR_MODULE_NOT_FOUND: /private/sensitive/path"),
    );
    await flush();
    expect(onDiagnostic).toHaveBeenCalledWith({
      botId: "bot-one",
      code: "module-resolution",
    });
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_PROTOCOL,
      id: requestId(1),
      ok: false,
      error: "The named engine could not start.",
    });
    await f.host?.stopAll();
  });

  it("reports one bot exit after an error on a ready worker", async () => {
    const onDiagnostic = vi.fn();
    const f = fixture({ onDiagnostic });
    f.start("bot-one", 1);
    f.workers[0]?.emit("message", {
      protocol: ENGINE_WORKER_PROTOCOL,
      type: "ready",
      ready: ready("bot-one"),
    });
    await flush();
    f.workers[0]?.emit("error", new Error("worker crashed"));
    expect(f.workers[0]?.messages).toContainEqual({
      protocol: ENGINE_WORKER_PROTOCOL,
      type: "shutdown",
    });
    f.workers[0]?.emit("exit", 1);
    f.workers[0]?.emit("exit", 1);
    await flush();
    expect(onDiagnostic).toHaveBeenCalledWith({
      botId: "bot-one",
      code: "worker-error",
    });
    expect(
      f.ipc.send.mock.calls
        .map(([message]) => message)
        .filter((message) => message?.event === "bot-exit"),
    ).toEqual([
      {
        protocol: ENGINE_PROTOCOL,
        event: "bot-exit",
        botId: "bot-one",
      },
    ]);
  });

  it("drops delayed old responses and ACKs after an ID is reused with a newer sequence", async () => {
    const f = fixture();
    f.start("bot-one", 1);
    f.workers[0]?.emit("message", {
      protocol: ENGINE_WORKER_PROTOCOL,
      type: "ready",
      ready: ready("bot-one"),
    });
    const emitHost = (message: Record<string, unknown>) =>
      f.workers[0]?.emit("message", {
        protocol: ENGINE_WORKER_PROTOCOL,
        type: "host-message",
        message: {
          protocol: WORKER_HOST_PROTOCOL,
          id: requestId(70),
          ...message,
        },
      });
    emitHost({ sequence: 1, operation: "codex.auth" });
    emitHost({ sequence: 1, cancel: true });
    emitHost({ sequence: 2, operation: "codex.auth" });
    emitHost({ sequence: 1, ack: true });
    f.ipc.emit("message", {
      protocol: ENGINE_HOST_PROTOCOL,
      botId: "bot-one",
      message: {
        protocol: WORKER_HOST_PROTOCOL,
        id: requestId(70),
        sequence: 1,
        ok: true,
      },
    });
    expect(f.workers[0]?.messages).toEqual([]);
    f.ipc.emit("message", {
      protocol: ENGINE_HOST_PROTOCOL,
      botId: "bot-one",
      message: {
        protocol: WORKER_HOST_PROTOCOL,
        id: requestId(70),
        sequence: 2,
        ok: true,
      },
    });
    expect(f.workers[0]?.messages).toEqual([
      {
        protocol: ENGINE_WORKER_PROTOCOL,
        type: "host-message",
        message: {
          protocol: WORKER_HOST_PROTOCOL,
          id: requestId(70),
          sequence: 2,
          botId: "bot-one",
          ok: true,
        },
      },
    ]);
    await f.host?.stopAll();
  });

  it("accepts over 8192 sequential requests and reserves headroom for control traffic", async () => {
    const f = fixture();
    f.start("bot-one", 1);
    const emitHost = (
      id: number,
      sequence: number,
      details: Record<string, unknown>,
    ) =>
      f.workers[0]?.emit("message", {
        protocol: ENGINE_WORKER_PROTOCOL,
        type: "host-message",
        message: {
          protocol: WORKER_HOST_PROTOCOL,
          id: requestId(id),
          sequence,
          ...details,
        },
      });
    for (let sequence = 1; sequence <= 10_000; sequence++) {
      emitHost(70, sequence, { operation: "codex.auth" });
      emitHost(70, sequence, { cancel: true });
    }
    const forwarded = f.ipc.send.mock.calls.filter(
      ([message]) => message?.protocol === ENGINE_HOST_PROTOCOL,
    );
    expect(forwarded).toHaveLength(20_000);
    for (let sequence = 10_001; sequence <= 10_016; sequence++) {
      emitHost(sequence, sequence, { operation: "execution.claim" });
    }
    emitHost(20_001, 10_017, { operation: "execution.claim" });
    expect(f.workers[0]?.messages).toContainEqual({
      protocol: ENGINE_WORKER_PROTOCOL,
      type: "host-message",
      message: {
        protocol: WORKER_HOST_PROTOCOL,
        id: requestId(20_001),
        sequence: 10_017,
        botId: "bot-one",
        ok: false,
        error: "Too many host requests are in flight.",
      },
    });
    emitHost(20_002, 10_018, { operation: "execution.release" });
    expect(f.ipc.send).toHaveBeenCalledWith({
      protocol: ENGINE_HOST_PROTOCOL,
      botId: "bot-one",
      message: {
        protocol: WORKER_HOST_PROTOCOL,
        id: requestId(20_002),
        sequence: 10_018,
        operation: "execution.release",
        botId: "bot-one",
      },
    });
    for (let sequence = 10_019; sequence <= 10_033; sequence++) {
      emitHost(sequence, sequence, { operation: "consult.wait" });
    }
    emitHost(20_003, 10_034, { operation: "consult.wait" });
    expect(f.workers[0]?.messages).toContainEqual({
      protocol: ENGINE_WORKER_PROTOCOL,
      type: "host-message",
      message: {
        protocol: WORKER_HOST_PROTOCOL,
        id: requestId(20_003),
        sequence: 10_034,
        botId: "bot-one",
        ok: false,
        error: "Too many host requests are in flight.",
      },
    });
    await f.host?.stopAll();
  });
});
