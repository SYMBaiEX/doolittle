import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  GatewayIngressSpool,
  MAX_PENDING_INGRESS_BYTES,
  MAX_PENDING_INGRESS_COUNT,
} from "../../packages/agent/src/gateway/receive/ingress-spool";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { runResponsePostCommit } from "../../packages/agent/src/server/responses";
import { handleWebhookRoutes } from "../../packages/agent/src/server/routes/webhooks";
import type { IncomingPlatformMessage } from "../../packages/agent/src/types/gateway";

const countLimit = MAX_PENDING_INGRESS_COUNT;
const byteLimit = MAX_PENDING_INGRESS_BYTES;
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function directory() {
  const path = mkdtempSync(join(tmpdir(), "gateway-capacity-"));
  directories.push(path);
  return path;
}

function message(id: string, text = "hello"): IncomingPlatformMessage {
  return {
    platform: "whatsapp",
    userId: "user",
    roomId: "user",
    channelId: "user",
    messageId: id,
    metadata: { messageId: id },
    text,
  };
}

function firstPending(spool: GatewayIngressSpool) {
  const entry = spool.pending()[0];
  if (!entry) throw new Error("Missing pending receipt");
  return entry;
}

function signedWebhook(spool: GatewayIngressSpool) {
  const startIngress = vi.fn();
  const context = {
    config: { whatsappAppSecret: "fixture-secret" },
    gateway: {
      acceptInbound: (message: IncomingPlatformMessage) =>
        spool.accept(message),
      startIngress,
    },
  } as unknown as AppContext;
  const request = async (...ids: string[]) => {
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: ids.map((id) => ({
                  id,
                  from: "user",
                  text: { body: "hello" },
                })),
              },
            },
          ],
        },
      ],
    });
    const url = new URL("http://localhost/webhooks/whatsapp");
    const response = await handleWebhookRoutes(
      context,
      new Request(url, {
        method: "POST",
        body,
        headers: {
          "x-hub-signature-256": `sha256=${createHmac("sha256", "fixture-secret").update(body).digest("hex")}`,
        },
      }),
      url,
    );
    if (!response) throw new Error("Missing webhook response");
    return response;
  };
  return { request, startIngress };
}

it("backpressures signed webhooks at the count cap, including processing and retrying receipts after restart", async () => {
  const path = directory();
  let spool = new GatewayIngressSpool(path);
  for (let id = 0; id < countLimit; id++) spool.accept(message(String(id)));
  const first = firstPending(spool);
  spool.claim(first.receiptId);
  const second = firstPending(spool);
  spool.setStatus(second, "retrying");
  spool = new GatewayIngressSpool(path);
  const { request } = signedWebhook(spool);
  const journal = readFileSync(spool.pathname, "utf8");
  const response = await request("overflow");
  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBe("1");
  expect(readFileSync(spool.pathname, "utf8")).toBe(journal);
  expect((await request("0")).status).toBe(200);
  expect(() => spool.accept(message("0", "changed"))).toThrow(
    /different payload/u,
  );
  spool.setStatus(first, "completed");
  expect((await request("overflow")).status).toBe(200);
  expect((await request("another")).status).toBe(503);
});

it("counts UTF-8 payload bytes, restores the byte budget on restart, and releases it on terminal transitions", () => {
  const path = directory();
  let spool = new GatewayIngressSpool(path);
  const large = "é".repeat(byteLimit / 4);
  spool.accept(message("one", large));
  spool = new GatewayIngressSpool(path);
  const journal = readFileSync(spool.pathname, "utf8");
  expect(() => spool.accept(message("two", large))).toThrow(/capacity/u);
  expect(readFileSync(spool.pathname, "utf8")).toBe(journal);
  const first = firstPending(spool);
  spool.setStatus(first, "rejected");
  expect(spool.accept(message("two", large))).toMatchObject({
    duplicate: false,
  });
  spool = new GatewayIngressSpool(path);
  expect(() => spool.accept(message("three", large))).toThrow(/capacity/u);
});

it("drains the accepted prefix of a batch and accepts its retry when capacity is freed", async () => {
  const spool = new GatewayIngressSpool(directory());
  for (let id = 0; id < countLimit - 1; id++) spool.accept(message(String(id)));
  const { request, startIngress } = signedWebhook(spool);
  const response = await request("last", "overflow");
  expect(response.status).toBe(503);
  runResponsePostCommit(response);
  expect(startIngress).toHaveBeenCalledOnce();
  spool.setStatus(firstPending(spool), "completed");
  const retry = await request("last", "overflow");
  expect(retry.status).toBe(200);
  expect((await retry.json()).receipts).toMatchObject([
    { duplicate: true },
    { duplicate: false },
  ]);
});
