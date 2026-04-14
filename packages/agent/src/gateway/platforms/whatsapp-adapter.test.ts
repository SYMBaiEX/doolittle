import { describe, expect, it } from "bun:test";
import type { EnvConfig } from "@/types/runtime";
import { createDeliveryRoot, installFetchMock } from "./test-helpers";
import { WhatsAppPlatformAdapter } from "./whatsapp-adapter";

describe("WhatsAppPlatformAdapter", () => {
  it("posts to Graph API and records delivery with reply context", async () => {
    const { delivery, cleanup } = createDeliveryRoot("whatsapp");
    const restoreFetch = installFetchMock(async (url, init) => {
      expect(url).toBe("https://graph.facebook.com/v22.0/phone-123/messages");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer token",
        "content-type": "application/json",
      });
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messaging_product?: string;
        to?: string;
        type?: string;
        text?: { body?: string };
        context?: { message_id?: string };
      };
      expect(body.messaging_product).toBe("whatsapp");
      expect(body.to).toBe("room-1");
      expect(body.type).toBe("text");
      expect(body.text?.body).toBe("hello from whatsapp");
      expect(body.context).toEqual({ message_id: "reply-1" });

      return new Response(JSON.stringify({ messages: [{ id: "wa-123" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const adapter = new WhatsAppPlatformAdapter(
      "whatsapp",
      {
        whatsappAccessToken: "token",
        whatsappPhoneNumberId: "phone-123",
        whatsappVerifyToken: "verify-token",
      } as EnvConfig,
      delivery,
    );

    try {
      await adapter.start();
      const record = await adapter.send({
        roomId: "room-1",
        userId: "user-1",
        text: "hello from whatsapp",
        replyToId: "reply-1",
      });
      const health = await adapter.health();

      expect(record.text).toBe("hello from whatsapp");
      expect(health.ready).toBe(true);
      expect(health.lastDeliveryId).toBe(record.id);
      expect(health.sendCount).toBe(1);
    } finally {
      restoreFetch();
      cleanup();
    }
  });

  it("throws when WhatsApp credentials are incomplete", async () => {
    const { delivery, cleanup } = createDeliveryRoot("whatsapp-no-creds");
    const adapter = new WhatsAppPlatformAdapter(
      "whatsapp",
      {
        whatsappAccessToken: "token",
        whatsappPhoneNumberId: undefined,
        whatsappVerifyToken: "verify-token",
      } as EnvConfig,
      delivery,
    );

    try {
      await expect(
        adapter.send({
          roomId: "room-1",
          userId: "user-1",
          text: "blocked",
        }),
      ).rejects.toThrow("WhatsApp credentials are not configured.");
    } finally {
      cleanup();
    }
  });
});
