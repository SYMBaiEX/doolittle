import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NativeMessagingTransportState } from "@/runtime/native/service-bridge/transport-control";
import { DeliveryService } from "@/services/delivery-service";
import type { EnvConfig } from "@/types/runtime";
import { TelegramPlatformAdapter } from "./telegram-adapter";

function createDeliveryRoot() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-telegram-adapter-"));
  return {
    root,
    delivery: new DeliveryService(join(root, "delivery")),
  };
}

function installFetchMock(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
): () => void {
  const originalFetch = globalThis.fetch;
  const mockFetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" || input instanceof URL
          ? input.toString()
          : input.url;
      return handler(url, init);
    },
    {
      preconnect: async () => {},
    },
  ) as typeof fetch;
  globalThis.fetch = mockFetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const nativeBridge: NativeMessagingTransportState = {
  platform: "telegram",
  pluginId: "telegram-native",
  pluginSource: "official",
  configEnabled: true,
  pluginEnabled: true,
  gatewayEnabled: true,
  serviceName: "telegram-service",
  serviceAvailable: true,
  live: true,
  reason: "live",
  detail: "service ready",
  ready: true,
  summary: "telegram: ready",
};

describe("TelegramPlatformAdapter", () => {
  it("sends voice messages and records native delivery metadata", async () => {
    const { root, delivery } = createDeliveryRoot();
    const voicePath = join(root, "reply.ogg");
    writeFileSync(voicePath, "voice");
    const restoreFetch = installFetchMock(async (url, init) => {
      expect(url).toBe("https://telegram.example/bottoken/sendVoice");
      expect(init?.method).toBe("POST");
      const form = init?.body as FormData;
      expect(form.get("chat_id")).toBe("room-1");
      expect(form.get("caption")).toBe("hello from telegram");
      expect(form.get("reply_to_message_id")).toBe("9");
      return new Response(
        JSON.stringify({
          result: {
            message_id: 321,
            chat: { id: 654 },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    const adapter = new TelegramPlatformAdapter(
      "telegram",
      {
        telegramBotToken: "token",
        telegramApiRoot: "https://telegram.example",
      } as EnvConfig,
      delivery,
      () => nativeBridge,
    );

    try {
      await adapter.start();
      const record = await adapter.send({
        roomId: "room-1",
        userId: "user-1",
        text: "hello from telegram",
        replyToId: "9",
        metadata: {
          audioAsVoice: "true",
          attachmentUrls: voicePath,
        },
      });
      const health = await adapter.health();

      expect(record.metadata?.platformMessageId).toBe("321");
      expect(record.metadata?.platformRoomId).toBe("654");
      expect(health.ready).toBe(true);
      expect(health.nativePluginId).toBe("telegram-native");
      expect(health.lastDeliveryId).toBe(record.id);
    } finally {
      restoreFetch();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("edits an existing Telegram delivery using stored platform ids", async () => {
    const { root, delivery } = createDeliveryRoot();
    const restoreFetch = installFetchMock(async (url, init) => {
      expect(url).toBe("https://telegram.example/bottoken/editMessageText");
      expect(init?.method).toBe("POST");
      expect(
        JSON.parse(String(init?.body ?? "{}")) as {
          chat_id?: string;
          message_id?: number;
          text?: string;
        },
      ).toEqual({
        chat_id: "room-1",
        message_id: 321,
        text: "edited telegram reply",
      });
      return new Response(
        JSON.stringify({
          result: {
            message_id: 321,
            chat: { id: "room-1" },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    const adapter = new TelegramPlatformAdapter(
      "telegram",
      {
        telegramBotToken: "token",
        telegramApiRoot: "https://telegram.example",
      } as EnvConfig,
      delivery,
    );
    const deliveryRecord = delivery.deliver(
      {
        platform: "telegram",
        channelId: "room-1",
        userId: "user-1",
        mode: "explicit",
      },
      "original telegram reply",
      {
        metadata: {
          platformRoomId: "room-1",
          platformMessageId: "321",
        },
      },
    );

    try {
      const updated = await adapter.edit(deliveryRecord, {
        roomId: "room-1",
        userId: "user-1",
        text: "edited telegram reply",
        metadata: { source: "test" },
      });

      expect(updated.text).toBe("edited telegram reply");
      expect(updated.editCount).toBe(1);
      expect(updated.metadata?.platformMessageId).toBe("321");
      expect(updated.metadata?.platformRoomId).toBe("room-1");
      expect(updated.metadata?.source).toBe("test");
    } finally {
      restoreFetch();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
