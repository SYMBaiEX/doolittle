import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NativeMessagingTransportState } from "@/runtime/native/service-bridge/transport-control";
import { DeliveryService } from "@/services/delivery-service";
import type { EnvConfig } from "@/types/runtime";
import { DiscordPlatformAdapter } from "./discord-adapter";

function createDeliveryRoot() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-discord-adapter-"));
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
  platform: "discord",
  pluginId: "discord-native",
  pluginSource: "official",
  configEnabled: true,
  pluginEnabled: true,
  gatewayEnabled: true,
  serviceName: "discord-service",
  serviceAvailable: true,
  live: true,
  reason: "live",
  detail: "service ready",
  ready: true,
  summary: "discord: ready",
};

describe("DiscordPlatformAdapter", () => {
  it("sends voice messages and records Discord delivery metadata", async () => {
    const { root, delivery } = createDeliveryRoot();
    const voicePath = join(root, "reply.ogg");
    writeFileSync(voicePath, "voice");
    const restoreFetch = installFetchMock(async (url, init) => {
      expect(url).toBe("https://discord.com/api/v10/channels/room-1/messages");
      expect(init?.method).toBe("POST");
      expect(
        (init?.headers as Record<string, string>)?.Authorization ??
          (init?.headers as Headers).get("Authorization"),
      ).toBe("Bot token");
      const form = init?.body as FormData;
      expect(form.get("files[0]")).toBeTruthy();
      expect(
        JSON.parse(String(form.get("payload_json"))) as {
          content?: string;
          message_reference?: { message_id?: string; channel_id?: string };
        },
      ).toEqual({
        content: "hello from discord",
        message_reference: {
          message_id: "reply-1",
          channel_id: "room-1",
        },
      });
      return new Response(
        JSON.stringify({
          id: "message-42",
          channel_id: "channel-9",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    const adapter = new DiscordPlatformAdapter(
      "discord",
      {
        discordBotToken: "token",
      } as EnvConfig,
      delivery,
      () => nativeBridge,
    );

    try {
      await adapter.start();
      const record = await adapter.send({
        roomId: "room-1",
        userId: "user-1",
        text: "hello from discord",
        replyToId: "reply-1",
        metadata: {
          audioAsVoice: "true",
          attachmentUrls: voicePath,
        },
      });
      const health = await adapter.health();

      expect(record.metadata?.platformMessageId).toBe("message-42");
      expect(record.metadata?.platformRoomId).toBe("channel-9");
      expect(health.ready).toBe(true);
      expect(health.nativePluginId).toBe("discord-native");
      expect(health.lastDeliveryId).toBe(record.id);
    } finally {
      restoreFetch();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("edits an existing Discord delivery using stored platform ids", async () => {
    const { root, delivery } = createDeliveryRoot();
    const restoreFetch = installFetchMock(async (url, init) => {
      expect(url).toBe(
        "https://discord.com/api/v10/channels/channel-9/messages/message-42",
      );
      expect(init?.method).toBe("PATCH");
      expect(
        JSON.parse(String(init?.body ?? "{}")) as {
          content?: string;
        },
      ).toEqual({
        content: "edited discord reply",
      });
      return new Response(
        JSON.stringify({
          id: "message-42",
          channel_id: "channel-9",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    const adapter = new DiscordPlatformAdapter(
      "discord",
      {
        discordBotToken: "token",
      } as EnvConfig,
      delivery,
    );
    const deliveryRecord = delivery.deliver(
      {
        platform: "discord",
        channelId: "channel-9",
        userId: "user-1",
        mode: "explicit",
      },
      "original discord reply",
      {
        metadata: {
          platformRoomId: "channel-9",
          platformMessageId: "message-42",
        },
      },
    );

    try {
      const updated = await adapter.edit(deliveryRecord, {
        roomId: "room-1",
        userId: "user-1",
        text: "edited discord reply",
        metadata: { source: "test" },
      });

      expect(updated.text).toBe("edited discord reply");
      expect(updated.editCount).toBe(1);
      expect(updated.metadata?.platformMessageId).toBe("message-42");
      expect(updated.metadata?.platformRoomId).toBe("channel-9");
      expect(updated.metadata?.source).toBe("test");
    } finally {
      restoreFetch();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
