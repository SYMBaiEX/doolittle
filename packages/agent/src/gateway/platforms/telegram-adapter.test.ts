import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { NativeTelegramTransportService } from "@/runtime/native/service-bridge/runtime-contracts";
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
  it("sends voice messages through the native Eliza bot and records delivery metadata", async () => {
    const { root, delivery } = createDeliveryRoot();
    const voicePath = join(root, "reply.ogg");
    writeFileSync(voicePath, "voice");
    const sendVoice = vi.fn(async () => ({
      message_id: 321,
      chat: { id: 654 },
    }));
    const nativeService: NativeTelegramTransportService = {
      getBot: () => ({
        telegram: {
          sendVoice,
        },
      }),
      messageManager: {
        sendMessage: vi.fn(async () => []),
        editMessage: vi.fn(async () => undefined),
      },
    };
    const adapter = new TelegramPlatformAdapter(
      "telegram",
      {
        telegramBotToken: "token",
        telegramApiRoot: "https://telegram.example",
      } as EnvConfig,
      delivery,
      () => nativeBridge,
      () => nativeService,
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
      expect(sendVoice).toHaveBeenCalledWith(
        "room-1",
        expect.objectContaining({ source: expect.anything() }),
        {
          caption: "hello from telegram",
          reply_parameters: { message_id: 9 },
        },
      );
      expect(health.ready).toBe(true);
      expect(health.nativePluginId).toBe("telegram-native");
      expect(health.lastDeliveryId).toBe(record.id);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sends text through the native message manager with reply and thread context", async () => {
    const { root, delivery } = createDeliveryRoot();
    const sendMessage = vi.fn(async () => [
      { message_id: 321, chat: { id: "room-1" } },
    ]);
    const nativeService: NativeTelegramTransportService = {
      getBot: () => ({
        telegram: {
          sendVoice: vi.fn(async () => ({
            message_id: 1,
            chat: { id: "room-1" },
          })),
        },
      }),
      messageManager: {
        sendMessage,
        editMessage: vi.fn(async () => undefined),
      },
    };
    const adapter = new TelegramPlatformAdapter(
      "telegram",
      { telegramBotToken: "token" } as EnvConfig,
      delivery,
      () => nativeBridge,
      () => nativeService,
    );

    try {
      const record = await adapter.send({
        roomId: "room-1",
        userId: "user-1",
        text: "hello from telegram",
        replyToId: "9",
        threadId: "42",
        metadata: { source: "test" },
      });

      expect(sendMessage).toHaveBeenCalledWith(
        "room-1",
        {
          text: "hello from telegram",
          source: "telegram",
          metadata: { source: "test" },
        },
        9,
        42,
      );
      expect(record.metadata?.platformMessageId).toBe("321");
      expect(record.metadata?.platformRoomId).toBe("room-1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("edits an existing Telegram delivery through the native message manager", async () => {
    const { root, delivery } = createDeliveryRoot();
    const editMessage = vi.fn(async () => undefined);
    const nativeService: NativeTelegramTransportService = {
      getBot: () => ({
        telegram: {
          sendVoice: vi.fn(async () => ({
            message_id: 1,
            chat: { id: "room-1" },
          })),
        },
      }),
      messageManager: {
        sendMessage: vi.fn(async () => []),
        editMessage,
      },
    };
    const adapter = new TelegramPlatformAdapter(
      "telegram",
      { telegramBotToken: "token" } as EnvConfig,
      delivery,
      () => nativeBridge,
      () => nativeService,
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

      expect(editMessage).toHaveBeenCalledWith(
        "room-1",
        321,
        "edited telegram reply",
        undefined,
      );
      expect(updated.text).toBe("edited telegram reply");
      expect(updated.editCount).toBe(1);
      expect(updated.metadata?.platformMessageId).toBe("321");
      expect(updated.metadata?.platformRoomId).toBe("room-1");
      expect(updated.metadata?.source).toBe("test");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails instead of bypassing the runtime when the native service is unavailable", async () => {
    const { root, delivery } = createDeliveryRoot();
    const adapter = new TelegramPlatformAdapter(
      "telegram",
      { telegramBotToken: "token" } as EnvConfig,
      delivery,
      () => ({ ...nativeBridge, live: false, ready: false }),
    );

    try {
      await expect(
        adapter.send({
          roomId: "room-1",
          text: "must stay runtime-owned",
        }),
      ).rejects.toThrow("native Eliza Telegram service is not ready");
      expect(delivery.recent()).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
