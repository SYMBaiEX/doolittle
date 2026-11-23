import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { deliverGatewayReceiveResponse } from "../../packages/agent/src/gateway/receive/delivery";
import { GatewayIngressSpool } from "../../packages/agent/src/gateway/receive/ingress-spool";
import type { GatewayRunnerContext } from "../../packages/agent/src/gateway/runner/context";
import { GatewayRunner } from "../../packages/agent/src/gateway/runner/service";
import type { GatewayRunnerRuntimeApi } from "../../packages/agent/src/gateway/runner/service-runtime/api";
import { wireGatewayRunnerRuntime } from "../../packages/agent/src/gateway/runner/service-runtime/wire";
import { createNoopLogger } from "../../packages/agent/src/logging/logger";
import { createDeferred } from "../support/deferred";

vi.mock("../../packages/agent/src/gateway/runner/service-runtime/wire", () => ({
  wireGatewayRunnerRuntime: vi.fn(),
}));

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
const message = {
  platform: "slack" as const,
  userId: "user",
  roomId: "room",
  messageId: "one",
  text: "hello",
};

function fixture() {
  const path = mkdtempSync(join(tmpdir(), "gateway-startup-"));
  directories.push(path);
  const starting = createDeferred<void>();
  const send = vi.fn(async () => ({ id: "reply" }));
  const adapter = { send };
  let loadedAdapter: typeof adapter | undefined;
  const receive = vi.fn(async () => {
    const delivery = await deliverGatewayReceiveResponse({
      context: { services: { media: {} } },
      adapter: loadedAdapter,
      message,
      session: { ...message, sessionKey: "session" },
      response: "recovered reply",
      traceId: "trace",
      pushTrace: () => {},
      observeAdapter: async () => {},
      recordOutbox: () => {},
    } as unknown as Parameters<typeof deliverGatewayReceiveResponse>[0]);
    return {
      ok: true,
      response: "recovered reply",
      agentCompleted: true,
      deliveryStatus: delivery.status,
    };
  });
  const start = vi.fn(async () => {
    await starting.promise;
    loadedAdapter = adapter;
  });
  vi.mocked(wireGatewayRunnerRuntime).mockReturnValue({
    control: {
      start,
      stop: async () => {
        loadedAdapter = undefined;
      },
    },
    delivery: { receive },
  } as unknown as GatewayRunnerRuntimeApi);
  const context = {
    config: { gatewayDataDir: path },
    services: { logger: createNoopLogger() },
  } as unknown as GatewayRunnerContext;
  return { path, starting, send, receive, runner: new GatewayRunner(context) };
}

it.each(["queued", "processing"] as const)(
  "delivers a %s startup receipt only after adapters have loaded",
  async (status) => {
    const { path, starting, send, receive, runner } = fixture();
    const spool = new GatewayIngressSpool(join(path, "journals"));
    const receipt = spool.accept(message);
    if (status === "processing") spool.claim(receipt.receiptId);
    expect(runner.acceptInbound(message)).toMatchObject({
      duplicate: true,
      status,
    });
    const started = runner.start();
    await runner.waitForIngressIdle();
    expect(send).not.toHaveBeenCalled();
    starting.resolve();
    try {
      await started;
      await runner.waitForIngressIdle();
      expect(send).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: "recovered reply", roomId: "room" }),
      );
      expect(receive).toHaveBeenCalledOnce();
      expect(runner.ingressHistory()[0]?.status).toBe("completed");
    } finally {
      await runner.stop();
    }
  },
);

it("does not consume pending receipts when adapter startup fails", async () => {
  const { starting, receive, runner } = fixture();
  runner.acceptInbound(message);
  const started = runner.start();
  starting.reject(new Error("adapter unavailable"));
  try {
    await expect(started).rejects.toThrow("adapter unavailable");
    await runner.waitForIngressIdle();
    expect(receive).not.toHaveBeenCalled();
    expect(runner.ingressHistory()[0]?.status).toBe("queued");
  } finally {
    await runner.stop();
  }
});

it("starts with an empty ingress journal without delivery", async () => {
  const { starting, receive, runner } = fixture();
  starting.resolve();
  try {
    await runner.start();
    await runner.waitForIngressIdle();
    expect(receive).not.toHaveBeenCalled();
  } finally {
    await runner.stop();
  }
});
