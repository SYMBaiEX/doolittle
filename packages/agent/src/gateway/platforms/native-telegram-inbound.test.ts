import { describe, expect, it, vi } from "vitest";
import {
  installNativeTelegramInboundHandoff,
  normalizeNativeTelegramMessage,
} from "./native-telegram-inbound";

function message(overrides: Record<string, unknown> = {}) {
  return {
    message_id: 42,
    text: "hello Telegram",
    date: 1_723_500_000,
    chat: { id: -1001, type: "supergroup", title: "Ops" },
    from: { id: 7, username: "operator" },
    ...overrides,
  };
}

function createService() {
  return {
    accountId: "default",
    messageManager: {
      handleMessage: vi.fn(async (..._args: unknown[]) => undefined),
    },
  };
}

describe("native Telegram inbound handoff", () => {
  it("normalizes text, captioned media, replies, and account metadata", () => {
    expect(
      normalizeNativeTelegramMessage(
        {
          message: message({
            text: undefined,
            caption: "incident recording",
            reply_to_message: { message_id: 11 },
            voice: {
              file_id: "voice-1",
              mime_type: "audio/ogg",
              duration: 4,
              file_size: 128,
            },
          }),
        },
        "work",
      ),
    ).toMatchObject({
      platform: "telegram",
      userId: "7",
      roomId: "-1001",
      text: "incident recording",
      replyToMessageId: "11",
      messageId: "42",
      timestamp: "2024-08-12T22:00:00.000Z",
      metadata: {
        nativeConnector: "telegram",
        accountId: "work",
        chatTitle: "Ops",
        attachmentCount: "1",
        attachmentKinds: "voice",
        attachmentDurationsMs: "4000",
      },
    });
    expect(
      normalizeNativeTelegramMessage({
        message: message({ reply_to_message: { message_id: 11 } }),
      })?.threadId,
    ).toBeUndefined();
  });

  it("uses Telegram forum topic identity rather than a reply as the session thread", () => {
    expect(
      normalizeNativeTelegramMessage({
        message: message({
          is_topic_message: true,
          message_thread_id: 81,
          reply_to_message: { message_id: 11 },
        }),
      }),
    ).toMatchObject({
      threadId: "81",
      replyToMessageId: "11",
      metadata: { isTopicMessage: "true", messageThreadId: "81" },
    });
  });

  it("uses the narrow adapter for media-only messages", () => {
    expect(
      normalizeNativeTelegramMessage({
        message: message({
          text: undefined,
          photo: [{ file_id: "photo-small" }, { file_id: "photo-large" }],
        }),
      }),
    ).toMatchObject({
      text: "[Telegram attachment]",
      metadata: { attachmentCount: "1", attachmentKinds: "photo" },
    });
  });

  it("wraps each account manager exactly once and preserves account metadata", async () => {
    const defaultManager = {
      handleMessage: vi.fn(async (..._args: unknown[]) => undefined),
    };
    const workManager = {
      handleMessage: vi.fn(async (..._args: unknown[]) => undefined),
    };
    const service = {
      accountId: "default",
      messageManager: defaultManager,
      getAccountIds: () => ["default", "work"],
      getAccountState: (accountId: string) => ({
        accountId,
        messageManager: accountId === "work" ? workManager : defaultManager,
      }),
    };
    const receive = vi.fn(async () => ({ ok: true }));
    const runtime = { getService: vi.fn(() => service) };

    expect(installNativeTelegramInboundHandoff(runtime, { receive })).toBe(
      true,
    );
    expect(installNativeTelegramInboundHandoff(runtime, { receive })).toBe(
      false,
    );
    await workManager.handleMessage({
      message: message({ text: "work chat" }),
    });

    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "work chat",
        metadata: expect.objectContaining({ accountId: "work" }),
      }),
    );
  });

  it("filters malformed and nonmessage contexts without reaching the gateway", async () => {
    const service = createService();
    const receive = vi.fn(async () => ({ ok: true }));
    installNativeTelegramInboundHandoff(
      { getService: vi.fn(() => service) },
      { receive },
    );

    await service.messageManager.handleMessage({});
    await service.messageManager.handleMessage({
      message: message({ from: undefined }),
    });
    await service.messageManager.handleMessage({
      message: message({ text: undefined }),
    });

    expect(receive).not.toHaveBeenCalled();
  });

  it("does not invoke the original manager handler after the handoff", async () => {
    const original = vi.fn(async (..._args: unknown[]) => undefined);
    const service = {
      accountId: "default",
      messageManager: { handleMessage: original },
    };
    const receive = vi.fn(async () => ({ ok: true }));

    expect(
      installNativeTelegramInboundHandoff(
        { getService: vi.fn(() => service) },
        { receive },
      ),
    ).toBe(true);
    await service.messageManager.handleMessage({ message: message() });

    expect(original).not.toHaveBeenCalled();
    expect(receive).toHaveBeenCalledTimes(1);
  });

  it("delivers rejected pairing responses through the native manager", async () => {
    const sendMessage = vi.fn(async (..._args: unknown[]) => []);
    const service = {
      accountId: "default",
      messageManager: {
        handleMessage: vi.fn(async (..._args: unknown[]) => undefined),
        sendMessage,
      },
    };
    const receive = vi.fn(async () => ({
      ok: false,
      response: "Authorization required. Pairing code: PAIR-42",
      pairingCode: "PAIR-42",
    }));

    installNativeTelegramInboundHandoff(
      { getService: vi.fn(() => service) },
      { receive },
    );
    await service.messageManager.handleMessage({
      message: message({ is_topic_message: true, message_thread_id: 81 }),
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "-1001",
      expect.objectContaining({
        text: "Authorization required. Pairing code: PAIR-42",
        source: "telegram",
        metadata: expect.objectContaining({
          accountId: "default",
          gatewayResponse: "rejected",
          pairingCode: "PAIR-42",
        }),
      }),
      42,
      81,
    );
  });
});
