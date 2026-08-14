import { describe, expect, it, vi } from "vitest";
import {
  installNativeWhatsAppInboundHandoff,
  normalizeNativeWhatsAppMessage,
} from "./native-whatsapp-inbound";

function createService() {
  return {
    handleNormalizedMessage: vi.fn(async (..._args: unknown[]) => undefined),
  };
}

describe("native WhatsApp inbound handoff", () => {
  it("normalizes text, groups, replies, and account metadata", () => {
    expect(
      normalizeNativeWhatsAppMessage(
        {
          id: "wamid.1",
          from: "15555550123",
          chatId: "120363@g.us",
          senderId: "15555550000",
          timestamp: 1700000000,
          content: "hello group",
          replyToId: "wamid.previous",
        },
        "work-account",
      ),
    ).toMatchObject({
      platform: "whatsapp",
      userId: "15555550000",
      roomId: "120363@g.us",
      channelId: "120363@g.us",
      channelType: "group",
      messageId: "wamid.1",
      replyToMessageId: "wamid.previous",
      metadata: {
        nativeConnector: "whatsapp",
        accountId: "work-account",
        groupId: "120363@g.us",
      },
    });
  });

  it("routes accepted messages, preserves account IDs, and installs idempotently", async () => {
    const service = createService();
    const receive = vi.fn(async () => ({ ok: true }));
    const runtime = { getService: vi.fn(() => service) };

    expect(installNativeWhatsAppInboundHandoff(runtime, { receive })).toBe(
      true,
    );
    expect(installNativeWhatsAppInboundHandoff(runtime, { receive })).toBe(
      false,
    );

    await service.handleNormalizedMessage(
      {
        id: "wamid.2",
        from: "15555550123",
        timestamp: 1700000001,
        content: "hello",
      },
      "account-b",
    );

    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "hello",
        metadata: expect.objectContaining({ accountId: "account-b" }),
      }),
    );
  });

  it("does not invoke the original handler after a successful handoff", async () => {
    const original = vi.fn(async (..._args: unknown[]) => undefined);
    const service = { handleNormalizedMessage: original };
    const receive = vi.fn(async () => ({ ok: true }));

    expect(
      installNativeWhatsAppInboundHandoff(
        { getService: vi.fn(() => service) },
        { receive },
      ),
    ).toBe(true);
    await service.handleNormalizedMessage({
      id: "wamid.3",
      from: "15555550123",
      timestamp: 1700000002,
      content: "hello",
    });

    expect(original).not.toHaveBeenCalled();
    expect(receive).toHaveBeenCalledTimes(1);
  });

  it("keeps attachment-only messages visible and filters malformed payloads", async () => {
    expect(
      normalizeNativeWhatsAppMessage({
        id: "wamid.media",
        from: "15555550123",
        timestamp: 1700000003,
        type: "image",
      }),
    ).toMatchObject({
      text: "[WhatsApp image attachment]",
      metadata: { messageType: "image" },
    });

    const service = createService();
    const receive = vi.fn(async () => ({ ok: true }));
    installNativeWhatsAppInboundHandoff(
      { getService: vi.fn(() => service) },
      { receive },
    );
    await service.handleNormalizedMessage({
      id: "",
      from: "15555550123",
      timestamp: 1,
      content: "bad",
    });
    await service.handleNormalizedMessage({
      id: "wamid.empty",
      from: "15555550123",
      timestamp: 2,
      type: "text",
      content: "",
    });
    expect(receive).not.toHaveBeenCalled();
  });
});
