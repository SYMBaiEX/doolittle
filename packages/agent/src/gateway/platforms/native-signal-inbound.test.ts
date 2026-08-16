import { describe, expect, it, vi } from "vitest";
import {
  installNativeSignalInboundHandoff,
  normalizeNativeSignalMessage,
} from "./native-signal-inbound";

function createService() {
  return {
    runtime: {
      getSetting: vi.fn((_key?: string) => false),
    },
    settings: undefined as { shouldIgnoreGroupMessages?: boolean } | undefined,
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

  it("privately replies to a group pairing rejection with account and quote context", async () => {
    const service = createService();
    const sendMessage = vi.fn(async (..._args: unknown[]) => undefined);
    const sendGroupMessage = vi.fn(async (..._args: unknown[]) => undefined);
    Object.assign(service, { sendMessage, sendGroupMessage });
    const receive = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, response: "Pair with DTL-42" })
      .mockResolvedValueOnce({
        ok: false,
        response: "Delivery failed",
        agentCompleted: true,
        deliveryStatus: "rejected",
      });
    installNativeSignalInboundHandoff(
      { getService: () => service },
      { receive },
    );

    await service.handleIncomingMessage(
      {
        sender: "+15555550123",
        message: "pair me",
        timestamp: 1700000000123,
        groupId: "group-abc",
      },
      "account-b",
    );
    await service.handleIncomingMessage(
      {
        sender: "+15555550123",
        message: "do not resend",
        timestamp: 1700000000124,
      },
      "account-b",
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      "+15555550123",
      "Pair with DTL-42",
      {
        accountId: "account-b",
        quote: { timestamp: 1700000000123, author: "+15555550123" },
      },
    );
    expect(sendGroupMessage).not.toHaveBeenCalled();
  });

  it("replies directly to a direct pairing rejection with account and quote context", async () => {
    const service = createService();
    const sendMessage = vi.fn(async (..._args: unknown[]) => undefined);
    Object.assign(service, { sendMessage });
    const receive = vi.fn(async () => ({
      ok: false,
      response: "Pair with DTL-42",
    }));
    installNativeSignalInboundHandoff(
      { getService: () => service },
      { receive },
    );

    await service.handleIncomingMessage(
      {
        sender: "+15555550123",
        message: "pair me",
        timestamp: 1700000000123,
      },
      "account-b",
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      "+15555550123",
      "Pair with DTL-42",
      {
        accountId: "account-b",
        quote: { timestamp: 1700000000123, author: "+15555550123" },
      },
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

  it("does not route group messages when pinned Signal settings disable them", async () => {
    const service = createService();
    service.settings = { shouldIgnoreGroupMessages: true };
    const receive = vi.fn(async () => ({ ok: true }));
    installNativeSignalInboundHandoff(
      { getService: () => service },
      { receive },
    );

    await service.handleIncomingMessage({
      sender: "+15555550123",
      message: "group message",
      timestamp: 1700000000125,
      groupId: "group-abc",
    });
    await service.handleIncomingMessage({
      sender: "+15555550123",
      message: "direct message",
      timestamp: 1700000000126,
    });

    expect(receive).toHaveBeenCalledOnce();
    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({ channelType: "dm" }),
    );
  });

  it("routes groups when pinned Signal settings enable them", async () => {
    const service = createService();
    service.runtime.getSetting.mockReturnValue(true);
    service.settings = { shouldIgnoreGroupMessages: false };
    const receive = vi.fn(async () => ({ ok: true }));
    installNativeSignalInboundHandoff(
      { getService: () => service },
      { receive },
    );

    await service.handleIncomingMessage({
      sender: "+15555550123",
      message: "group message",
      timestamp: 1700000000127,
      groupId: "group-abc",
    });

    expect(receive).toHaveBeenCalledOnce();
  });

  it("uses the runtime Signal group policy when service settings are unavailable", async () => {
    const service = createService();
    service.runtime.getSetting.mockReturnValue(true);
    const receive = vi.fn(async () => ({ ok: true }));
    installNativeSignalInboundHandoff(
      { getService: () => service },
      { receive },
    );

    await service.handleIncomingMessage({
      sender: "+15555550123",
      message: "group message",
      timestamp: 1700000000128,
      groupId: "group-abc",
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
