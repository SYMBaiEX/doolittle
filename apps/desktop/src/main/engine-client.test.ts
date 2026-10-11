import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { EngineClient } from "./engine-client";
import { DesktopExecutionAdmission } from "./execution-admission";
import { releaseAbandonedExecutionClaim } from "./execution-receipt";

class FakeChild extends EventEmitter {
  connected = true;
  sent: Record<string, unknown>[] = [];
  send(
    value: Record<string, unknown>,
    callback?: (error: Error | null) => void,
  ): boolean {
    this.sent.push(value);
    callback?.(null);
    return true;
  }
  reply(request: Record<string, unknown>, result?: unknown, ok = true): void {
    this.emit("message", {
      protocol: "doolittle-engine-v1",
      id: request.id,
      ok,
      result,
    });
  }
  asChild(): ChildProcess {
    return this as unknown as ChildProcess;
  }
  sentAt(index: number): Record<string, unknown> {
    const request = this.sent[index];
    if (!request) throw new Error("Expected control request was not sent.");
    return request;
  }
}

const ready = (botId: string) => ({
  url: "http://127.0.0.1:43210",
  botId,
  agentId: "agent-1",
  name: "Bot One",
});

describe("EngineClient", () => {
  it("rolls back a named execution grant canceled before receipt acknowledgement", async () => {
    const child = new FakeChild();
    const client = new EngineClient(child.asChild());
    const admission = new DesktopExecutionAdmission({ maxConcurrent: 1 });
    const start = client.startBot(
      "bot-one",
      {},
      "agent-1",
      async (request, signal) => {
        if (
          request.operation !== "execution.claim" &&
          request.operation !== "execution.release"
        )
          throw new Error("Unavailable");
        return admission.handle(
          "bot-one",
          request.operation,
          request.payload,
          {},
          signal,
        );
      },
      () => admission.releaseBot("bot-one"),
      (request, result) =>
        releaseAbandonedExecutionClaim(admission, "bot-one", request, result),
    );
    child.reply(child.sentAt(0), ready("bot-one"));
    await start;
    const id = "123e4567-e89b-42d3-a456-426614174000";
    child.emit("message", {
      protocol: "doolittle-engine-host-v1",
      botId: "bot-one",
      message: {
        protocol: "doolittle-worker-host-v1",
        botId: "bot-one",
        id,
        sequence: 1,
        operation: "execution.claim",
        payload: { runId: "run", sessionId: "session", kind: "foreground" },
      },
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(admission.snapshot().active).toBe(1);
    expect(
      child.sent.some((row) => row.protocol === "doolittle-engine-host-v1"),
    ).toBe(true);
    child.emit("message", {
      protocol: "doolittle-engine-host-v1",
      botId: "bot-one",
      message: {
        protocol: "doolittle-worker-host-v1",
        botId: "bot-one",
        id,
        sequence: 1,
        cancel: true,
      },
    });
    expect(admission.snapshot().active).toBe(0);
    client.dispose();
  });
  it("rejects forged start identity and never retains its host binding", async () => {
    const child = new FakeChild();
    const client = new EngineClient(child.asChild());
    let disconnected = 0;
    const start = client.startBot(
      "bot-one",
      {},
      "agent-1",
      async () => true,
      () => disconnected++,
    );
    child.reply(child.sentAt(0), { ...ready("bot-two") });
    await Promise.resolve();
    child.reply(child.sentAt(1));
    await expect(start).rejects.toThrow("different identity");
    expect(disconnected).toBe(0);
    const retry = client.startBot(
      "bot-one",
      {},
      "agent-1",
      async () => true,
      () => {},
    );
    child.reply(child.sentAt(2), ready("bot-one"));
    await expect(retry).resolves.toEqual(ready("bot-one"));
    client.dispose();
  });

  it("does not route cross-bot host envelopes and aborts on disconnect", async () => {
    const child = new FakeChild();
    const client = new EngineClient(child.asChild());
    let calls = 0;
    let aborted = false;
    let disconnected = 0;
    const start = client.startBot(
      "bot-one",
      {},
      "agent-1",
      async (_request, signal) => {
        calls++;
        signal.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise(() => {});
      },
      () => disconnected++,
    );
    child.reply(child.sentAt(0), ready("bot-one"));
    await start;
    const request = {
      protocol: "doolittle-worker-host-v1",
      botId: "bot-one",
      id: "123e4567-e89b-42d3-a456-426614174000",
      sequence: 1,
      operation: "execution.claim",
      payload: {},
    };
    child.emit("message", {
      protocol: "doolittle-engine-host-v1",
      botId: "bot-two",
      message: request,
    });
    expect(calls).toBe(0);
    child.emit("message", {
      protocol: "doolittle-engine-host-v1",
      botId: "bot-one",
      message: request,
    });
    await Promise.resolve();
    expect(calls).toBe(1);
    child.connected = false;
    child.emit("disconnect");
    expect(aborted).toBe(true);
    expect(disconnected).toBe(1);
    await expect(client.stopBot("bot-one")).rejects.toThrow("unavailable");
  });

  it("requires an acknowledged stop before releasing a bot host", async () => {
    const child = new FakeChild();
    const client = new EngineClient(child.asChild());
    let disconnected = 0;
    const start = client.startBot(
      "bot-one",
      {},
      "agent-1",
      async () => true,
      () => disconnected++,
    );
    child.reply(child.sentAt(0), ready("bot-one"));
    await start;
    const failedStop = client.stopBot("bot-one");
    child.reply(child.sentAt(1), undefined, false);
    await expect(failedStop).rejects.toThrow("could not complete");
    expect(disconnected).toBe(0);
    const stop = client.stopBot("bot-one");
    child.reply(child.sentAt(2));
    await stop;
    expect(disconnected).toBe(0);
    client.dispose();
  });

  it("rejects a non-loopback endpoint and aborts pending controls on disconnect", async () => {
    const child = new FakeChild();
    const client = new EngineClient(child.asChild());
    const start = client.startBot(
      "bot-one",
      {},
      "agent-1",
      async () => true,
      () => {},
    );
    child.reply(child.sentAt(0), {
      ...ready("bot-one"),
      url: "http://127.0.0.1:43210/path",
    });
    await Promise.resolve();
    const cleanup = child.sentAt(1);
    expect(cleanup.operation).toBe("stop");
    child.connected = false;
    child.emit("disconnect");
    await expect(start).rejects.toThrow("stop was not confirmed");
  });
});
