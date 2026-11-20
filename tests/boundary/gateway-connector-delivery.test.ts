import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import "../../apps/cli/src/entrypoint/host-execution";
import { buildEnvConfig } from "../../packages/agent/src/config/env/build";
import { parseEnv } from "../../packages/agent/src/config/env/schema";
import { getDefaultGatewayConfig } from "../../packages/agent/src/config/gateway";
import { createPlatformAdapter } from "../../packages/agent/src/gateway/adapters/platform-adapter-factory";
import { authorizeMessage } from "../../packages/agent/src/gateway/authorization";
import type { PlatformAdapter } from "../../packages/agent/src/gateway/platforms/base";
import { TelegramPlatformAdapter } from "../../packages/agent/src/gateway/platforms/telegram-adapter";
import { GatewayIngressSpool } from "../../packages/agent/src/gateway/receive/ingress-spool";
import { GatewayIngressWorker } from "../../packages/agent/src/gateway/receive/ingress-worker";
import type { GatewayReceiveResult } from "../../packages/agent/src/gateway/receive/types";
import type { GatewayRunnerContext } from "../../packages/agent/src/gateway/runner/context";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { runResponsePostCommit } from "../../packages/agent/src/server/responses";
import { handleWebhookRoutes } from "../../packages/agent/src/server/routes/webhooks";
import { DeliveryService } from "../../packages/agent/src/services/delivery-service";
import { GatewayPairingProjection } from "../../packages/agent/src/services/gateway-pairing";
import type { IncomingPlatformMessage } from "../../packages/agent/src/types/gateway";

const secret = "fixture-secret";
const payloadText = "Connector acceptance";
const replyText = "Offline fixture response";
const command =
  process.platform === "win32"
    ? "echo %DOOLITTLE_PLATFORM%:%DOOLITTLE_USER_ID%:%DOOLITTLE_MESSAGE_TEXT%"
    : 'printf "%s" "$DOOLITTLE_PLATFORM:$DOOLITTLE_USER_ID:$DOOLITTLE_MESSAGE_TEXT"';
const timestamp = () => String(Math.floor(Date.now() / 1_000));
const sign = (body: string) =>
  createHmac("sha256", secret).update(body).digest("hex");
const whatsapp = (id: string, from = "15550101234") => ({
  id,
  from,
  text: { body: payloadText },
});
const whatsappChange = (...messages: ReturnType<typeof whatsapp>[]) => ({
  value: { messages },
});

const connectors = [
  {
    platform: "telegram",
    body: {
      message: {
        message_id: 11,
        from: { id: 5 },
        chat: { id: 6 },
        is_topic_message: true,
        message_thread_id: 12,
        text: payloadText,
      },
    },
    user: "5",
    room: "6",
    id: "11",
  },
  {
    platform: "discord",
    body: {
      id: "11",
      channel_id: "room",
      author: { id: "person" },
      content: payloadText,
    },
    user: "person",
    room: "room",
    id: "11",
    endpoint: "https://discord.com/api/v10/channels/room/messages",
  },
  {
    platform: "slack",
    body: {
      event: {
        type: "message",
        user: "person",
        channel: "room",
        ts: "11.1",
        text: payloadText,
      },
    },
    user: "person",
    room: "room",
    id: "11.1",
    endpoint: "https://fixture.invalid/slack",
  },
  {
    platform: "whatsapp",
    body: { entry: [{ changes: [whatsappChange(whatsapp("message-11"))] }] },
    user: "15550101234",
    room: "15550101234",
    id: "message-11",
    endpoint: "https://graph.facebook.com/v27.0/fixture-number/messages",
  },
  {
    platform: "signal",
    body: {
      sender: "person",
      conversation_id: "room",
      message_id: "11",
      message: payloadText,
    },
    user: "person",
    room: "room",
    id: "11",
    command: true,
  },
  {
    platform: "matrix",
    body: {
      sender: "person",
      room_id: "room",
      event_id: "11",
      content: { body: payloadText },
    },
    user: "person",
    room: "room",
    id: "11",
    endpoint:
      /^https:\/\/fixture\.invalid\/_matrix\/client\/v3\/rooms\/room\/send\/m\.room\.message\/[0-9a-f-]+$/u,
  },
  {
    platform: "email",
    body: {
      from: "person@example.invalid",
      to: "agent@example.invalid",
      message_id: "11",
      text: payloadText,
    },
    user: "person@example.invalid",
    room: "agent@example.invalid",
    id: "11",
    command: true,
  },
  {
    platform: "sms",
    body: {
      From: "15550101234",
      To: "15550101235",
      MessageSid: "11",
      Body: payloadText,
    },
    user: "15550101234",
    room: "15550101235",
    id: "11",
    command: true,
  },
  {
    platform: "mattermost",
    body: {
      post: {
        id: "11",
        user_id: "person",
        channel_id: "room",
        message: payloadText,
      },
    },
    user: "person",
    room: "room",
    id: "11",
    endpoint: "https://fixture.invalid/api/v4/posts",
  },
  {
    platform: "homeassistant",
    body: {
      event: {
        context: { id: "11", user_id: "person" },
        data: { channel: "room", message: payloadText },
      },
    },
    user: "person",
    room: "room",
    id: "11",
    endpoint: "https://fixture.invalid/api/services/notify/eliza_agent",
  },
  {
    platform: "dingtalk",
    body: {
      msgId: "11",
      senderId: "person",
      conversationId: "room",
      text: { content: payloadText },
    },
    user: "person",
    room: "room",
    id: "11",
    endpoint: "https://fixture.invalid/dingtalk?access_token=fixture",
  },
] as const;

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

async function fixture(
  platform: (typeof connectors)[number]["platform"],
  user: string,
  useSdkConnector = false,
) {
  const dir = mkdtempSync(join(tmpdir(), "doolittle-gateway-fixture-"));
  directories.push(dir);
  const env = {
    TELEGRAM_BOT_TOKEN: "fixture",
    DISCORD_BOT_TOKEN: "fixture",
    SLACK_SIGNING_SECRET: secret,
    SLACK_WEBHOOK_URL: "https://fixture.invalid/slack",
    SLACK_BOT_TOKEN: "fixture",
    SLACK_APP_TOKEN: "fixture",
    WHATSAPP_APP_SECRET: secret,
    WHATSAPP_ACCESS_TOKEN: "fixture",
    WHATSAPP_PHONE_NUMBER_ID: "fixture-number",
    WHATSAPP_VERIFY_TOKEN: "fixture",
    SIGNAL_CLI_COMMAND: command,
    SIGNAL_ACCOUNT_NUMBER: "15550101234",
    MATRIX_HOMESERVER: "https://fixture.invalid",
    MATRIX_ACCESS_TOKEN: "fixture",
    EMAIL_SEND_COMMAND: command,
    SMS_SEND_COMMAND: command,
    MATTERMOST_URL: "https://fixture.invalid",
    MATTERMOST_TOKEN: "fixture",
    HOMEASSISTANT_URL: "https://fixture.invalid",
    HOMEASSISTANT_TOKEN: "fixture",
    DINGTALK_WEBHOOK_URL: "https://fixture.invalid/dingtalk",
    DINGTALK_ACCESS_TOKEN: "fixture",
  };
  const config = buildEnvConfig(
    parseEnv(env),
    {
      dataDir: dir,
      skillsDir: dir,
      gatewayDataDir: dir,
      hooksDir: dir,
      workspaceDir: dir,
    },
    env,
  );
  const delivery = new DeliveryService(dir);
  const gatewayConfig = getDefaultGatewayConfig(config);
  gatewayConfig.platforms[platform] = {
    enabled: true,
    pairingMode: "deny",
    allowedUserIds: [user],
  };
  const pairing = new GatewayPairingProjection([platform]);
  const spool = new GatewayIngressSpool(dir);
  const telegramVoice = vi.fn(async () => ({
    message_id: 22,
    chat: { id: 6 },
  }));
  const telegramSend = vi.fn(async () => [{ message_id: 22, chat: { id: 6 } }]);
  const telegramEdit = vi.fn(async () => {});
  const sdkDelivery = {
    kind: "delivered",
    memories: [],
    receipt: {
      acceptedAt: 1,
      providerMessageIds: ["native-22"],
      persistence: { status: "persisted", memoryIds: [] },
    },
  };
  const sendMessageToTarget = vi.fn(async () => sdkDelivery);
  const editMessageOnTarget = vi.fn(async () => sdkDelivery);
  const runtime = {
    getMessageConnectors: () =>
      useSdkConnector
        ? [
            {
              source: platform,
              capabilities: ["send_message", "edit_message"],
              editHandler: vi.fn(),
              label: platform,
            },
          ]
        : [],
    getService: () => null,
    sendMessageToTarget,
    editMessageOnTarget,
  };
  const services = { delivery, gatewayConfig };
  const adapter: PlatformAdapter =
    platform === "telegram"
      ? new TelegramPlatformAdapter(
          platform,
          config,
          delivery,
          undefined,
          () => ({
            getBot: () => ({ telegram: { sendVoice: telegramVoice } }),
            messageManager: {
              sendMessage: telegramSend,
              editMessage: telegramEdit,
            },
          }),
        )
      : createPlatformAdapter(platform, {
          config,
          runtime,
          services,
        } as unknown as GatewayRunnerContext);
  await adapter.start();
  const inputs: IncomingPlatformMessage[] = [];
  const receive = async (
    message: IncomingPlatformMessage,
  ): Promise<GatewayReceiveResult> => {
    const authorized = await authorizeMessage(message, gatewayConfig, pairing);
    if (!authorized.allowed)
      return {
        ok: false,
        response: authorized.reason ?? "",
        idempotencyDisposition: "terminal",
      };
    inputs.push(message);
    const sent = await adapter.send({
      roomId: message.roomId,
      userId: message.userId,
      replyToId: message.messageId,
      threadId: message.threadId,
      text: replyText,
    });
    return {
      ok: true,
      response: replyText,
      deliveryId: sent.id,
      deliveryStatus: "sent",
    };
  };
  const worker = new GatewayIngressWorker(spool, receive);
  const context = {
    config,
    gateway: {
      receive,
      acceptInbound: (message: IncomingPlatformMessage) =>
        spool.accept(message),
      startIngress: () => worker.start(),
    },
  } as unknown as AppContext;
  const request = async (payload: unknown, signRequest = true) => {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (platform === "slack" && signRequest) {
      const now = timestamp();
      headers["x-slack-request-timestamp"] = now;
      headers["x-slack-signature"] = `v0=${sign(`v0:${now}:${body}`)}`;
    }
    if (platform === "whatsapp" && signRequest)
      headers["x-hub-signature-256"] = `sha256=${sign(body)}`;
    const url = new URL(`http://127.0.0.1/webhooks/${platform}`);
    const response = await handleWebhookRoutes(
      context,
      new Request(url, { method: "POST", body, headers }),
      url,
    );
    if (!response) throw new Error("Fixture webhook did not match a route.");
    return response;
  };
  return {
    adapter,
    delivery,
    inputs,
    request,
    spool,
    worker,
    telegramSend,
    telegramEdit,
    sendMessageToTarget,
    editMessageOnTarget,
  };
}

function providerFixture() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/states"))
      return Response.json([{ entity_id: "light.fixture" }]);
    if (url.includes("discord.com"))
      return Response.json({ id: "22", channel_id: "room" });
    if (url.includes("graph.facebook.com"))
      return Response.json({ messages: [{ id: "sent-22" }] });
    if (url.includes("/dingtalk"))
      return Response.json({ errcode: 0, errmsg: "ok" });
    if (url.includes("/_matrix/"))
      return Response.json({ event_id: "$sent-22" });
    if (url.includes("/api/v4/posts"))
      return Response.json({ id: "sent-22", channel_id: "room" });
    if (url.endsWith("/slack")) return new Response("ok");
    if (url.includes("/api/services/notify/")) return Response.json([]);
    throw new Error("Unexpected outbound provider request in fixture.");
  });
}

it.each(connectors)(
  "$platform processes a webhook and saves a local delivery receipt",
  async (entry) => {
    const called = providerFixture();
    const f = await fixture(entry.platform, entry.user);
    expect((await f.adapter.health()).ready).toBe(true);
    try {
      const response = await f.request(entry.body);
      expect(response.status).toBe(200);
      if (entry.platform === "slack" || entry.platform === "whatsapp")
        expect(f.delivery.recent()).toHaveLength(0);
      runResponsePostCommit(response);
      await f.worker.idle();
      expect(f.inputs).toMatchObject([
        {
          platform: entry.platform,
          userId: entry.user,
          roomId: entry.room,
          messageId: entry.id,
          text: payloadText,
        },
      ]);
      const [record] = f.delivery.recent();
      expect(record).toMatchObject({
        target: {
          platform: entry.platform,
          channelId: entry.room,
          userId: entry.user,
        },
        text: replyText,
        replyToId: entry.id,
      });
      if ("endpoint" in entry) {
        const [url, options] = called.mock.calls[0] ?? [];
        if (typeof entry.endpoint === "string")
          expect(url).toBe(entry.endpoint);
        else expect(url).toMatch(entry.endpoint);
        expect(options?.method).toBe(
          entry.platform === "matrix" ? "PUT" : "POST",
        );
        expect(options?.body).toContain(replyText);
      }
      if ("command" in entry)
        expect(record?.metadata?.commandStdout).toBe(
          `${entry.platform}:${entry.user}:${replyText}`,
        );
      if (entry.platform === "homeassistant")
        expect(await f.adapter.watch?.()).toMatchObject({ count: 1 });
      if (entry.platform === "telegram" && record) {
        expect(f.telegramSend).toHaveBeenCalledWith(
          "6",
          expect.objectContaining({ text: replyText }),
          11,
          12,
        );
        await f.adapter.edit?.(record, { roomId: "6", text: "edited" });
        expect(f.telegramEdit).toHaveBeenCalledWith("6", 22, "edited", 12);
        expect(f.delivery.get(record.id)).toMatchObject({
          editCount: 1,
          text: "edited",
        });
      }
    } finally {
      await f.worker.stop();
      await f.adapter.stop();
    }
  },
);

it("commits batched WhatsApp messages after the signed response and deduplicates a provider retry", async () => {
  providerFixture();
  const f = await fixture("whatsapp", "15550101234");
  const batch = {
    entry: [
      {
        changes: [
          { value: { statuses: [{ id: "status-only" }] } },
          whatsappChange(whatsapp("one"), whatsapp("two")),
        ],
      },
      {
        changes: [
          whatsappChange(whatsapp("three"), whatsapp("denied", "15550999999")),
        ],
      },
    ],
  };
  try {
    expect((await f.request(batch, false)).status).toBe(403);
    expect((await f.request(null)).status).toBe(400);
    const accepted = await f.request(batch);
    expect(accepted.status).toBe(200);
    expect(f.spool.history()).toHaveLength(4);
    expect(f.delivery.recent()).toHaveLength(0);
    runResponsePostCommit(accepted);
    await f.worker.idle();
    expect(f.inputs.map((message) => message.messageId)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(
      f.spool.history().filter((entry) => entry.status === "rejected"),
    ).toHaveLength(1);
    const duplicate = await f.request(batch);
    expect((await duplicate.json()).receipts).toEqual(
      Array.from({ length: 4 }, () =>
        expect.objectContaining({ duplicate: true }),
      ),
    );
    runResponsePostCommit(duplicate);
    await f.worker.idle();
    expect(f.delivery.recent()).toHaveLength(3);
  } finally {
    await f.worker.stop();
    await f.adapter.stop();
  }
});

it.each(["discord", "slack", "signal", "whatsapp"] as const)(
  "%s prefers the registered SDK connector and attributes its provider receipt",
  async (platform) => {
    const entry = connectors.find(
      (candidate) => candidate.platform === platform,
    );
    if (!entry) throw new Error("Fixture provider payload is missing.");
    const fetch = providerFixture();
    const f = await fixture(platform, entry.user, true);
    try {
      const response = await f.request(entry.body);
      expect(response.status).toBe(200);
      runResponsePostCommit(response);
      await f.worker.idle();
      expect(fetch).not.toHaveBeenCalled();
      expect(f.sendMessageToTarget).toHaveBeenCalledWith(
        expect.objectContaining({ source: platform, channelId: entry.room }),
        expect.objectContaining({
          text: replyText,
          replyToExternalMessageId: entry.id,
        }),
      );
      const [delivery] = f.delivery.recent();
      if (!delivery) throw new Error("Missing local SDK delivery receipt.");
      expect(delivery.metadata?.platformMessageId).toBe("native-22");
      await f.adapter.edit?.(delivery, { roomId: entry.room, text: "edited" });
      expect(f.editMessageOnTarget).toHaveBeenCalledWith(
        expect.objectContaining({ channelId: entry.room }),
        "native-22",
        expect.objectContaining({ text: "edited" }),
      );
      expect(f.delivery.get(delivery.id)).toMatchObject({
        text: "edited",
        editCount: 1,
      });
    } finally {
      await f.worker.stop();
      await f.adapter.stop();
    }
  },
);

it("does not persist a DingTalk delivery when a 200 response carries a provider rejection", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    Response.json({ errcode: 310000, errmsg: "fixture rejection" }),
  );
  const f = await fixture("dingtalk", "person");
  try {
    await expect(
      f.adapter.send({ roomId: "room", text: replyText }),
    ).rejects.toThrow(/provider code 310000/u);
    expect(f.delivery.recent()).toHaveLength(0);
    expect(await f.adapter.health()).toMatchObject({
      lastError: expect.stringContaining("310000"),
    });
  } finally {
    await f.adapter.stop();
  }
});
