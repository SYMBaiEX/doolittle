import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { GatewayIngressSpool } from "../../packages/agent/src/gateway/receive/ingress-spool";
import {
  createConnectorIngressServer,
  type OwnedConnectorIngress,
  parseConnectorIngressPort,
} from "../../packages/agent/src/server";

const slackSecret = "fixture-slack-signing-secret";
const metaSecret = "fixture-meta-app-secret";
const metaToken = "fixture-meta-verification-token";

let listener: OwnedConnectorIngress | undefined;
let journal: string | undefined;
afterEach(async () => {
  await listener?.close();
  if (journal) await rm(journal, { recursive: true, force: true });
  listener = undefined;
  journal = undefined;
});

async function fixture() {
  const port = await new Promise<number>((resolve, reject) => {
    const reservation = createServer();
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      reservation.close((error) => {
        if (error) reject(error);
        else if (address && typeof address !== "string") resolve(address.port);
        else reject(new Error("Fixture port reservation failed"));
      });
    });
  });
  journal = await mkdtemp(join(tmpdir(), "doolittle-connector-ingress-"));
  const spool = new GatewayIngressSpool(journal);
  const startIngress = vi.fn();
  const workspaceIsCurrent = vi.fn(() => true);
  const context = {
    config: {
      slackSigningSecret: slackSecret,
      whatsappAppSecret: metaSecret,
      whatsappVerifyToken: metaToken,
    },
    gateway: {
      acceptInbound: (
        message: Parameters<GatewayIngressSpool["accept"]>[0],
        options?: { abortSignal?: AbortSignal },
      ) => spool.accept(message, options?.abortSignal),
      startIngress,
    },
  };
  const owned = await createConnectorIngressServer(context, {
    port,
    workspaceIsCurrent,
  });
  listener = owned;
  return { owned, spool, startIngress, workspaceIsCurrent, journal };
}

function slackHeaders(body: string | Uint8Array, secondsAgo = 0) {
  const timestamp = String(Math.floor(Date.now() / 1_000) - secondsAgo);
  const signature = createHmac("sha256", slackSecret)
    .update(`v0:${timestamp}:`)
    .update(body)
    .digest("hex");
  return {
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": `v0=${signature}`,
  };
}

function metaHeaders(body: string) {
  const signature = createHmac("sha256", metaSecret).update(body).digest("hex");
  return { "x-hub-signature-256": `sha256=${signature}` };
}

function slackEvent(text: string) {
  return JSON.stringify({
    type: "event_callback",
    event: { type: "message", user: "U1", channel: "C1", text, ts: "11.1" },
  });
}

function sendRaw(
  port: number,
  path: string,
  method = "POST",
  headers: Record<string, string> = {},
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      { hostname: "127.0.0.1", port, path, method, headers },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      },
    );
    outgoing.once("error", reject);
    outgoing.end();
  });
}

it("authenticates Slack raw bytes and commits stable receipts across retries", async () => {
  const { owned, spool, startIngress, journal } = await fixture();
  const post = (body: BodyInit, headers?: HeadersInit) =>
    fetch(`${owned.url}/webhooks/slack`, { method: "POST", headers, body });
  const original = slackEvent("Receive café with its original bytes");
  expect((await post(original)).status).toBe(403);
  expect((await post(original, slackHeaders(original, 301))).status).toBe(403);
  expect((await post(`${original}\n`, slackHeaders(original))).status).toBe(
    403,
  );
  const invalidUtf8 = Buffer.from([0xff]);
  expect((await post(invalidUtf8, slackHeaders(invalidUtf8))).status).toBe(400);
  expect(spool.pending()).toEqual([]);
  expect(startIngress).not.toHaveBeenCalled();

  const challenge = JSON.stringify({
    type: "url_verification",
    challenge: "slack-test",
  });
  expect(await (await post(challenge, slackHeaders(challenge))).json()).toEqual(
    {
      challenge: "slack-test",
    },
  );
  const headers = slackHeaders(original);
  const accepted = await post(original, headers);
  expect(accepted.status).toBe(200);
  expect(accepted.headers.get("cache-control")).toBe("no-store");
  const receipt = await accepted.json();
  expect(receipt).toMatchObject({
    ok: true,
    duplicate: false,
    status: "queued",
  });
  expect(await (await post(original, headers)).json()).toMatchObject({
    receiptId: receipt.receiptId,
    duplicate: true,
  });
  const changed = slackEvent("Reused provider identity with different content");
  expect((await post(changed, slackHeaders(changed))).status).toBe(409);
  expect(spool.pending()).toHaveLength(1);
  expect(new GatewayIngressSpool(journal).pending()).toMatchObject([
    { receiptId: receipt.receiptId },
  ]);
  expect(startIngress).toHaveBeenCalledTimes(2);
});

it("verifies Meta subscription challenges and spools signed batches without replaying messages", async () => {
  const { owned, spool } = await fixture();
  const callback = `${owned.url}/webhooks/whatsapp`;
  const probe = `${callback}?hub.mode=subscribe&hub.challenge=931&hub.verify_token=`;
  expect(await (await fetch(`${probe}${metaToken}`)).text()).toBe("931");
  expect((await fetch(`${probe}wrong`)).status).toBe(403);
  expect(
    (await fetch(`${probe}${metaToken}&hub.verify_token=${metaToken}`)).status,
  ).toBe(403);

  const messages = ["one", "two"].map((id) => ({
    id,
    from: "15550101234",
    text: { body: `Fixture ${id}` },
  }));
  const body = JSON.stringify({
    entry: [{ changes: [{ value: { messages } }] }],
  });
  const send = (headers: HeadersInit) =>
    fetch(callback, { method: "POST", body, headers });
  expect((await send(metaHeaders(`${body} `))).status).toBe(403);
  expect(await (await send(metaHeaders(body))).json()).toMatchObject({
    receipts: [{ duplicate: false }, { duplicate: false }],
  });
  expect(await (await send(metaHeaders(body))).json()).toMatchObject({
    receipts: [{ duplicate: true }, { duplicate: true }],
  });
  expect(spool.pending()).toHaveLength(2);
});

it("refuses owner paths, proxy path variants, browser origins and stale workspaces", async () => {
  const { owned, startIngress, workspaceIsCurrent } = await fixture();
  const port = Number(new URL(owned.url).port);
  const headers = {
    authorization: "Bearer fixture-owner-capability-not-public",
    "x-forwarded-for": "127.0.0.1",
  };
  for (const target of [
    "/settings",
    "/api/settings",
    "/terminal/run",
    "/webhooks/telegram",
    "/webhooks/slack/",
    "/webhooks/slack?query=1",
    "/webhooks/%73lack",
    "/prefix/../webhooks/slack",
    "//webhooks/slack",
    "http://127.0.0.1/webhooks/slack",
  ]) {
    expect(await sendRaw(port, target, "POST", headers), target).toBe(404);
  }
  expect(await sendRaw(port, "/webhooks/slack", "GET", headers)).toBe(404);
  expect(await sendRaw(port, "/webhooks/slack", "POST", headers)).toBe(403);
  expect(
    await sendRaw(port, "/webhooks/slack", "POST", {
      origin: "https://example.invalid",
    }),
  ).toBe(403);
  expect(
    await sendRaw(port, "/webhooks/slack", "POST", {
      "content-length": String(1024 * 1024 + 1),
    }),
  ).toBe(413);
  workspaceIsCurrent.mockReturnValueOnce(true).mockReturnValueOnce(false);
  const body = slackEvent("Workspace moved before acceptance");
  const response = await fetch(`${owned.url}/webhooks/slack`, {
    method: "POST",
    headers: slackHeaders(body),
    body,
  });
  expect(response.status).toBe(503);
  expect(startIngress).not.toHaveBeenCalled();
  await Promise.all([owned.close(), owned.close()]);
  await expect(sendRaw(port, "/webhooks/slack")).rejects.toMatchObject({
    code: "ECONNREFUSED",
  });
});

it("keeps connector ingress off by default and validates its explicit port", () => {
  expect(parseConnectorIngressPort(undefined)).toBeUndefined();
  expect(parseConnectorIngressPort("1024")).toBe(1024);
  expect(parseConnectorIngressPort("65535")).toBe(65535);
  for (const invalid of ["0", "1023", "65536", "0x1234", " 10443", "10443.0"]) {
    expect(() => parseConnectorIngressPort(invalid)).toThrow(/ingress port/i);
  }
});
