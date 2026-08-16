import { describe, expect, it, vi } from "vitest";
import {
  installNativeDiscordInboundHandoff,
  normalizeNativeDiscordMessage,
} from "./native-discord-inbound";

function createDiscordService() {
  return {
    accountId: "default",
    client: { user: { id: "bot-1" } },
    discordSettings: {
      shouldIgnoreBotMessages: true,
      shouldIgnoreDirectMessages: false,
      shouldRespondOnlyToMentions: false,
    },
    allowedChannelIds: [] as string[],
    isChannelAllowed: vi.fn(() => true),
    messageManager: {
      handleMessage: vi.fn(async (..._args: unknown[]) => undefined),
    },
  };
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    content: "hello Discord",
    id: "message-1",
    author: { id: "user-1", username: "operator", bot: false },
    channel: { id: "channel-1", type: "GuildText" },
    guildId: "guild-1",
    createdTimestamp: 1_723_500_000_000,
    ...overrides,
  };
}

describe("native Discord inbound handoff", () => {
  it("normalizes a native message with account, thread, and attachment metadata", () => {
    const service = createDiscordService();
    const normalized = normalizeNativeDiscordMessage(
      service,
      message({
        channel: {
          id: "thread-1",
          type: "PublicThread",
          parentId: "channel-1",
          isThread: () => true,
        },
        reference: { messageId: "parent-1" },
        attachments: [
          {
            id: "attachment-1",
            name: "capture.png",
            url: "https://cdn.example.com/capture.png",
            contentType: "image/png",
            size: 1024,
            width: 400,
            height: 300,
          },
        ],
      }),
      "account-a",
    );

    expect(normalized).toMatchObject({
      platform: "discord",
      userId: "user-1",
      roomId: "thread-1",
      threadId: "thread-1",
      replyToMessageId: "parent-1",
      timestamp: "2024-08-12T22:00:00.000Z",
      metadata: {
        nativeConnector: "discord",
        accountId: "account-a",
        guildId: "guild-1",
        attachmentCount: "1",
        attachmentNames: "capture.png",
      },
    });
  });

  it("normalizes attachment-only native messages with fallback text and media", () => {
    const normalized = normalizeNativeDiscordMessage(
      createDiscordService(),
      message({
        content: "",
        attachments: [
          {
            id: "attachment-1",
            name: "capture.png",
            url: "https://cdn.example.com/capture.png",
            contentType: "image/png",
            size: 1024,
            width: 400,
            height: 300,
          },
        ],
      }),
    );

    expect(normalized).toMatchObject({
      text: "Discord attachment: capture.png",
      attachments: [
        {
          id: "attachment-1",
          url: "https://cdn.example.com/capture.png",
          source: "discord",
          contentType: "image",
          mimeType: "image/png",
          filename: "capture.png",
          size: 1024,
          width: 400,
          height: 300,
        },
      ],
    });
  });

  it("rejects native messages without text or a usable attachment", () => {
    const service = createDiscordService();

    expect(
      normalizeNativeDiscordMessage(service, message({ content: "" })),
    ).toBeNull();
    expect(
      normalizeNativeDiscordMessage(
        service,
        message({
          content: "",
          attachments: [{ id: "attachment-1", name: "capture.png" }],
        }),
      ),
    ).toBeNull();
    expect(
      normalizeNativeDiscordMessage(
        service,
        message({
          content: "",
          attachments: [{ id: "attachment-1", url: "   ", proxyURL: "\t" }],
        }),
      ),
    ).toBeNull();
  });

  it("rejects malformed native attachment locators without throwing", () => {
    const malformed = message({
      content: "",
      attachments: [{ id: "attachment-1", url: {} as unknown as string }],
    });

    expect(() =>
      normalizeNativeDiscordMessage(createDiscordService(), malformed),
    ).not.toThrow();
    expect(
      normalizeNativeDiscordMessage(createDiscordService(), malformed),
    ).toBeNull();
  });

  it("drops malformed native attachment strings without throwing", () => {
    const malformed = message({
      content: {} as unknown as string,
      attachments: [
        {
          id: {} as unknown as string,
          name: {} as unknown as string,
          url: "https://cdn.example.com/capture.png",
          contentType: {} as unknown as string,
        },
      ],
    });

    expect(() =>
      normalizeNativeDiscordMessage(createDiscordService(), malformed),
    ).not.toThrow();
    expect(
      normalizeNativeDiscordMessage(createDiscordService(), malformed),
    ).toMatchObject({
      text: "Discord attachment",
      attachments: [
        expect.objectContaining({ url: "https://cdn.example.com/capture.png" }),
      ],
    });
  });

  it("rejects malformed attachment entries and preserves valid collection entries", () => {
    const malformed = message({
      content: "",
      attachments: [null, undefined, 42] as unknown as Array<{
        id?: string;
      }>,
    });

    expect(() =>
      normalizeNativeDiscordMessage(createDiscordService(), malformed),
    ).not.toThrow();
    expect(
      normalizeNativeDiscordMessage(createDiscordService(), malformed),
    ).toBeNull();

    expect(
      normalizeNativeDiscordMessage(
        createDiscordService(),
        message({
          content: "",
          attachments: [
            null,
            42,
            {
              id: "attachment-1",
              name: "capture.png",
              url: "https://cdn.example.com/capture.png",
            },
          ] as unknown as Array<{ id?: string }>,
        }),
      ),
    ).toMatchObject({
      text: "Discord attachment: capture.png",
      attachments: [
        expect.objectContaining({ url: "https://cdn.example.com/capture.png" }),
      ],
    });
  });

  it("routes accepted native messages through the shared gateway and installs once", async () => {
    const service = createDiscordService();
    const receive = vi.fn(async () => ({ ok: true }));
    const runtime = { getService: vi.fn(() => service) };

    expect(installNativeDiscordInboundHandoff(runtime, { receive })).toBe(true);
    expect(installNativeDiscordInboundHandoff(runtime, { receive })).toBe(
      false,
    );

    await service.messageManager.handleMessage(message());

    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "discord",
        text: "hello Discord",
        metadata: expect.objectContaining({
          nativeConnector: "discord",
          accountId: "default",
        }),
      }),
    );
  });

  it("routes attachment-only native messages through the shared gateway", async () => {
    const service = createDiscordService();
    const receive = vi.fn(async () => ({ ok: true }));

    expect(
      installNativeDiscordInboundHandoff(
        { getService: () => service },
        { receive },
      ),
    ).toBe(true);

    await service.messageManager.handleMessage(
      message({
        content: "",
        attachments: [
          {
            id: "attachment-1",
            filename: "capture.png",
            url: "",
            proxyURL: "https://cdn.example.com/capture.png",
            contentType: "image/png",
          },
        ],
      }),
    );

    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Discord attachment: capture.png",
        attachments: [
          expect.objectContaining({
            url: "https://cdn.example.com/capture.png",
            contentType: "image",
          }),
        ],
      }),
    );
  });

  it("replies once to a pre-agent pairing rejection without resending completed delivery", async () => {
    const service = createDiscordService();
    const send = vi.fn(async (..._args: unknown[]) => undefined);
    const receive = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        response: "Pair with code DTL-42",
        pairingCode: "DTL-42",
      })
      .mockResolvedValueOnce({
        ok: false,
        response: "Delivery failed",
        agentCompleted: true,
        deliveryStatus: "rejected",
      });
    installNativeDiscordInboundHandoff(
      { getService: () => service },
      { receive },
    );

    await service.messageManager.handleMessage(
      message({ channel: { id: "thread-1", type: "PublicThread", send } }),
    );
    await service.messageManager.handleMessage(
      message({ id: "message-2", channel: { id: "channel-1", send } }),
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      content: "Pair with code DTL-42",
      reply: { messageReference: "message-1" },
    });
  });

  it("preserves Discord bot, direct-message, channel, and mention policy", () => {
    const service = createDiscordService();
    service.allowedChannelIds = ["allowed-channel"];
    service.discordSettings.shouldIgnoreDirectMessages = true;
    service.discordSettings.shouldRespondOnlyToMentions = true;

    expect(
      normalizeNativeDiscordMessage(
        service,
        message({ author: { id: "bot-2", bot: true } }),
      ),
    ).toBeNull();
    expect(
      normalizeNativeDiscordMessage(
        service,
        message({
          channel: { id: "dm-1", type: "DM", isDMBased: () => true },
        }),
      ),
    ).toBeNull();
    expect(
      normalizeNativeDiscordMessage(
        service,
        message({ channel: { id: "blocked-channel", type: "GuildText" } }),
      ),
    ).toBeNull();
    expect(
      normalizeNativeDiscordMessage(
        service,
        message({ content: "hello <@bot-1>" }),
      ),
    ).toMatchObject({ platform: "discord" });
  });

  it("wraps every configured account manager when the plugin exposes an account pool", async () => {
    const defaultManager = {
      handleMessage: vi.fn(async (..._args: unknown[]) => undefined),
    };
    const accountManager = {
      handleMessage: vi.fn(async (..._args: unknown[]) => undefined),
    };
    const receive = vi.fn(async () => ({ ok: true }));
    const service = {
      ...createDiscordService(),
      messageManager: defaultManager,
      getAccountIds: () => ["default", "account-b"],
      getAccountState: (accountId: string) =>
        accountId === "account-b"
          ? {
              accountId,
              client: { user: { id: "bot-2" } },
              settings: { shouldRespondOnlyToMentions: false },
              allowedChannelIds: [],
              messageManager: accountManager,
            }
          : {
              accountId,
              client: { user: { id: "bot-1" } },
              settings: { shouldRespondOnlyToMentions: false },
              allowedChannelIds: [],
              messageManager: defaultManager,
            },
    };

    expect(
      installNativeDiscordInboundHandoff(
        { getService: () => service },
        { receive },
      ),
    ).toBe(true);

    await accountManager.handleMessage(
      message({ content: "account message", author: { id: "user-2" } }),
    );
    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "account message",
        metadata: expect.objectContaining({ accountId: "account-b" }),
      }),
    );
  });
});
