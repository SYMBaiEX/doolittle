import { describe, expect, it, vi } from "vitest";
import {
  installNativeSignalInboundHandoff,
  normalizeNativeSignalMessage,
} from "./native-signal-inbound";

function createService() {
  return {
    handleIncomingMessage: vi.fn(async (..._args: unknown[]) => undefined),
  };
}

describe("native Signal inbound handoff", () => {
  it("normalizes groups, quotes, attachments, and account metadata", () => {
    expect(
      normalizeNativeSignalMessage(
        {
          sender: "+15555550123",
          message: "hello group",
          timestamp: 1700000000123,
          groupId: "group-abc",
          quote: { id: 1700000000001, author: "+15555550000" },
          attachments: [
            {
              id: "attachment-1",
              filename: "voice.ogg",
              contentType: "audio/ogg",
              size: 42,
            },
          ],
        },
        "work-account",
      ),
    ).toMatchObject({
      platform: "signal",
      userId: "+15555550123",
      roomId: "group-abc",
      channelId: "group-abc",
      threadId: "1700000000001",
      replyToMessageId: "1700000000001",
      messageId: "1700000000123",
      timestamp: "1700000000123",
      metadata: {
        nativeConnector: "signal",
        accountId: "work-account",
        groupId: "group-abc",
        quoteId: "1700000000001",
        attachmentCount: "1",
        attachmentNames: "voice.ogg",
        attachmentMimeTypes: "audio/ogg",
        attachmentIds: "attachment-1",
      },
    });
  });

  it("routes accepted events, propagates account IDs, and installs idempotently", async () => {
    const service = createService();
    const receive = vi.fn(async () => ({ ok: true }));
    const runtime = { getService: vi.fn(() => service) };

    expect(installNativeSignalInboundHandoff(runtime, { receive })).toBe(true);
    expect(installNativeSignalInboundHandoff(runtime, { receive })).toBe(false);

    await service.handleIncomingMessage(
      { sender: "+15555550123", message: "hello", timestamp: 1700000000123 },
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
    const service = { handleIncomingMessage: original };
    const receive = vi.fn(async () => ({ ok: true }));

    expect(
      installNativeSignalInboundHandoff(
        { getService: vi.fn(() => service) },
        { receive },
      ),
    ).toBe(true);
    await service.handleIncomingMessage({
      sender: "+15555550123",
      message: "hello",
      timestamp: 1700000000123,
    });

    expect(original).not.toHaveBeenCalled();
    expect(receive).toHaveBeenCalledTimes(1);
  });

  it("filters reactions, malformed messages, and empty payloads", async () => {
    const service = createService();
    const receive = vi.fn(async () => ({ ok: true }));
    installNativeSignalInboundHandoff(
      { getService: vi.fn(() => service) },
      { receive },
    );

    await service.handleIncomingMessage({
      sender: "+15555550123",
      timestamp: 1,
      reaction: { emoji: "👍" },
    });
    await service.handleIncomingMessage({
      sender: "+15555550123",
      timestamp: 2,
    });
    await service.handleIncomingMessage({
      message: "missing sender",
      timestamp: 3,
    });
    await service.handleIncomingMessage({
      sender: "+15555550123",
      message: "bad",
    });

    expect(receive).not.toHaveBeenCalled();
  });

  it("accepts a supported attachment without text", async () => {
    const normalized = normalizeNativeSignalMessage({
      sender: "+15555550123",
      timestamp: 1700000000123,
      attachments: [{ id: "image-1", contentType: "image/png" }],
    });
    expect(normalized).toMatchObject({
      userId: "+15555550123",
      metadata: { attachmentCount: "1", attachmentMimeTypes: "image/png" },
    });
  });
});
