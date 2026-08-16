import { describe, expect, it, vi } from "vitest";
import {
  installNativeSlackInboundHandoff,
  normalizeNativeSlackEvent,
} from "./native-slack-inbound";

function createSlackService() {
  return {
    runtime: {
      getSetting: vi.fn((_key?: string) => false),
    },
    handleMessage: vi.fn(async (..._args: unknown[]) => undefined),
    handleAppMention: vi.fn(async (..._args: unknown[]) => undefined),
    getAllowedChannelIds: vi.fn((_accountId?: string | null) => [] as string[]),
    getBotUserId: vi.fn(() => "U-BOT"),
    getBotUserIdForAccount: undefined as
      | ((accountId: string) => string | null)
      | undefined,
  };
}

describe("native Slack inbound handoff", () => {
  it("normalizes Socket Mode messages with account metadata", () => {
    const service = createSlackService();

    expect(
      normalizeNativeSlackEvent(
        service,
        {
          type: "message",
          channel: "C123",
          channel_type: "channel",
          user: "U123",
          ts: "1700000000.000100",
          text: "hello Doolittle",
        },
        "workspace-a",
      ),
    ).toMatchObject({
      platform: "slack",
      userId: "U123",
      roomId: "C123",
      messageId: "1700000000.000100",
      metadata: {
        nativeConnector: "slack",
        accountId: "workspace-a",
      },
    });
  });

  it("routes accepted messages through the shared gateway and only installs once", async () => {
    const service = createSlackService();
    const receive = vi.fn(async () => ({ ok: true }));
    const runtime = {
      getService: vi.fn(() => service),
    };

    expect(installNativeSlackInboundHandoff(runtime, { receive })).toBe(true);
    expect(installNativeSlackInboundHandoff(runtime, { receive })).toBe(false);

    await service.handleMessage(
      {
        type: "message",
        channel: "C123",
        channel_type: "im",
        user: "U123",
        ts: "1700000000.000100",
        text: "hello",
      },
      {},
      "workspace-a",
    );

    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "slack",
        text: "hello",
        metadata: expect.objectContaining({ accountId: "workspace-a" }),
      }),
    );
    expect(service.getAllowedChannelIds).toHaveBeenCalledWith("workspace-a");
  });

  it("replies once to a pre-agent pairing rejection in the native thread", async () => {
    const service = createSlackService();
    const sendMessage = vi.fn(async (..._args: unknown[]) => undefined);
    Object.assign(service, { sendMessage });
    const receive = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, response: "Pair with DTL-42" })
      .mockResolvedValueOnce({
        ok: false,
        response: "Delivery failed",
        agentCompleted: true,
        deliveryStatus: "rejected",
      });
    installNativeSlackInboundHandoff(
      { getService: () => service },
      { receive },
    );

    await service.handleMessage(
      {
        type: "message",
        channel: "C123",
        channel_type: "channel",
        user: "U123",
        ts: "1700000000.000100",
        thread_ts: "1700000000.000001",
        text: "pair me",
      },
      {},
      "workspace-a",
    );
    await service.handleMessage(
      {
        type: "message",
        channel: "C123",
        channel_type: "channel",
        user: "U123",
        ts: "1700000000.000101",
        text: "do not resend",
      },
      {},
      "workspace-a",
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      "C123",
      "Pair with DTL-42",
      { threadTs: "1700000000.000001", replyBroadcast: undefined },
      "workspace-a",
    );
  });

  it("keeps Slack filtering before gateway authorization", async () => {
    const service = createSlackService();
    service.getAllowedChannelIds.mockReturnValue(["C-allowed"]);
    const receive = vi.fn(async () => ({ ok: true }));
    const runtime = { getService: vi.fn(() => service) };

    installNativeSlackInboundHandoff(runtime, { receive });
    await service.handleMessage(
      {
        type: "message",
        channel: "C-blocked",
        channel_type: "channel",
        user: "U123",
        ts: "1700000000.000101",
        text: "do not route",
      },
      {},
      "workspace-a",
    );

    expect(receive).not.toHaveBeenCalled();
  });

  it("applies account-specific allowed channels to app mentions", () => {
    const service = createSlackService();
    service.getAllowedChannelIds.mockImplementation(
      (accountId?: string | null) =>
        accountId === "workspace-secondary" ? ["C-allowed"] : [],
    );
    const mention = {
      type: "app_mention" as const,
      channel_type: "channel",
      user: "U123",
      ts: "1700000000.000114",
      text: "<@U-BOT> help",
    };

    expect(
      normalizeNativeSlackEvent(
        service,
        { ...mention, channel: "C-allowed" },
        "workspace-secondary",
      ),
    ).not.toBeNull();
    expect(
      normalizeNativeSlackEvent(
        service,
        { ...mention, channel: "C-blocked" },
        "workspace-secondary",
      ),
    ).toBeNull();
    expect(service.getAllowedChannelIds).toHaveBeenCalledWith(
      "workspace-secondary",
    );
  });

  it("uses the account bot-message policy for external bot messages", () => {
    const service = createSlackService();
    const getSettingsForAccount = vi.fn((accountId?: string) => ({
      shouldIgnoreBotMessages: accountId === "workspace-ignore-bots",
    }));
    Object.assign(service, { getSettingsForAccount });
    const externalBotMessage = {
      type: "message" as const,
      subtype: "bot_message",
      bot_id: "B-EXTERNAL",
      channel: "C123",
      channel_type: "channel",
      ts: "1700000000.000115",
      text: "external bot event",
    };

    expect(
      normalizeNativeSlackEvent(
        service,
        externalBotMessage,
        "workspace-allow-bots",
      ),
    ).not.toBeNull();
    expect(
      normalizeNativeSlackEvent(
        service,
        externalBotMessage,
        "workspace-allow-bots",
      ),
    ).toMatchObject({ userId: "B-EXTERNAL" });
    expect(
      normalizeNativeSlackEvent(
        service,
        externalBotMessage,
        "workspace-ignore-bots",
      ),
    ).toBeNull();
  });

  it("routes a channel message that mentions the bot", () => {
    const service = createSlackService();

    expect(
      normalizeNativeSlackEvent(service, {
        type: "message",
        channel: "C123",
        channel_type: "channel",
        user: "U123",
        ts: "1700000000.000103",
        text: "<@U-BOT> can you help?",
      }),
    ).toMatchObject({
      platform: "slack",
      roomId: "C123",
      text: "<@U-BOT> can you help?",
    });
  });

  it("applies mention-only mode to all messages, including DMs", () => {
    const service = createSlackService();
    service.runtime.getSetting.mockImplementation(
      (key?: string) => key === "SLACK_SHOULD_RESPOND_ONLY_TO_MENTIONS",
    );

    expect(
      normalizeNativeSlackEvent(service, {
        type: "message",
        channel: "C123",
        channel_type: "channel",
        user: "U123",
        ts: "1700000000.000104",
        text: "hello channel",
      }),
    ).toBeNull();

    expect(
      normalizeNativeSlackEvent(service, {
        type: "message",
        channel: "C123",
        channel_type: "channel",
        user: "U123",
        ts: "1700000000.000105",
        text: "<@U-BOT> hello channel",
      }),
    ).not.toBeNull();

    expect(
      normalizeNativeSlackEvent(service, {
        type: "message",
        channel: "D123",
        channel_type: "im",
        user: "U123",
        ts: "1700000000.000106",
        text: "hello directly",
      }),
    ).toBeNull();

    expect(
      normalizeNativeSlackEvent(service, {
        type: "message",
        channel: "D123",
        channel_type: "im",
        user: "U123",
        ts: "1700000000.000107",
        text: "<@U-BOT> hello directly",
      }),
    ).not.toBeNull();
  });

  it("uses the inbound account bot identity for mention-only filtering", () => {
    const service = createSlackService();
    service.runtime.getSetting.mockImplementation(
      (key?: string) => key === "SLACK_SHOULD_RESPOND_ONLY_TO_MENTIONS",
    );
    service.getBotUserIdForAccount = vi.fn((accountId: string) =>
      accountId === "workspace-secondary" ? "U-SECONDARY" : null,
    );

    expect(
      normalizeNativeSlackEvent(
        service,
        {
          type: "message",
          channel: "C123",
          channel_type: "channel",
          user: "U123",
          ts: "1700000000.000107",
          text: "<@U-SECONDARY> hello secondary account",
        },
        "workspace-secondary",
      ),
    ).not.toBeNull();

    expect(
      normalizeNativeSlackEvent(
        service,
        {
          type: "message",
          channel: "C123",
          channel_type: "channel",
          user: "U123",
          ts: "1700000000.000108",
          text: "<@U-BOT> do not use the default account identity",
        },
        "workspace-secondary",
      ),
    ).toBeNull();
    expect(service.getBotUserId).not.toHaveBeenCalled();
  });

  it("uses account settings before global Slack mention policy", () => {
    const service = createSlackService();
    service.runtime.getSetting.mockReturnValue(true);
    const getSettingsForAccount = vi.fn(() => ({
      shouldIgnoreBotMessages: false,
      shouldRespondOnlyToMentions: false,
    }));
    Object.assign(service, {
      getSettingsForAccount,
    });

    expect(
      normalizeNativeSlackEvent(
        service,
        {
          type: "message",
          channel: "C123",
          channel_type: "channel",
          user: "U123",
          ts: "1700000000.000111",
          text: "account policy allows this",
        },
        "workspace-secondary",
      ),
    ).not.toBeNull();
    expect(getSettingsForAccount).toHaveBeenCalledWith("workspace-secondary");
  });

  it("ignores a secondary account's own bot messages", () => {
    const service = createSlackService();
    service.getBotUserIdForAccount = vi.fn(() => "U-SECONDARY");

    expect(
      normalizeNativeSlackEvent(
        service,
        {
          type: "message",
          channel: "C123",
          channel_type: "channel",
          user: "U-SECONDARY",
          ts: "1700000000.000109",
          text: "my own message",
        },
        "workspace-secondary",
      ),
    ).toBeNull();
  });

  it("falls back to the default bot identity when account lookup is unavailable", () => {
    const service = createSlackService();
    service.runtime.getSetting.mockImplementation(
      (key?: string) => key === "SLACK_SHOULD_RESPOND_ONLY_TO_MENTIONS",
    );

    expect(
      normalizeNativeSlackEvent(
        service,
        {
          type: "message",
          channel: "C123",
          channel_type: "channel",
          user: "U123",
          ts: "1700000000.000110",
          text: "<@U-BOT> still works without account lookup",
        },
        "workspace-secondary",
      ),
    ).not.toBeNull();
    expect(service.getBotUserId).toHaveBeenCalledOnce();
  });

  it("routes app mentions through the same gateway contract", async () => {
    const service = createSlackService();
    const receive = vi.fn(async () => ({ ok: true }));
    const runtime = { getService: vi.fn(() => service) };

    installNativeSlackInboundHandoff(runtime, { receive });
    await service.handleAppMention(
      {
        type: "app_mention",
        channel: "C123",
        user: "U123",
        ts: "1700000000.000102",
        text: "<@U-BOT> help",
      },
      {},
      "workspace-a",
    );

    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "<@U-BOT> help",
        metadata: expect.objectContaining({ slackEventType: "app_mention" }),
      }),
    );
  });

  it("routes a channel mention once through app_mention", async () => {
    const service = createSlackService();
    const receive = vi.fn(async () => ({ ok: true }));
    installNativeSlackInboundHandoff(
      { getService: () => service },
      { receive },
    );
    const event = {
      channel: "C123",
      channel_type: "channel",
      user: "U123",
      ts: "1700000000.000112",
      text: "<@U-BOT> help",
    };

    await service.handleMessage(
      { ...event, type: "message" },
      {},
      "workspace-a",
    );
    await service.handleAppMention(
      { ...event, type: "app_mention" },
      {},
      "workspace-a",
    );

    expect(receive).toHaveBeenCalledTimes(1);
    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ slackEventType: "app_mention" }),
      }),
    );
  });

  it("falls back to the message event when app mentions are unavailable", async () => {
    const { handleAppMention: _unused, ...service } = createSlackService();
    const receive = vi.fn(async () => ({ ok: true }));
    installNativeSlackInboundHandoff(
      { getService: () => service },
      { receive },
    );

    await service.handleMessage(
      {
        type: "message",
        channel: "C123",
        channel_type: "channel",
        user: "U123",
        ts: "1700000000.000113",
        text: "<@U-BOT> help",
      },
      {},
      "workspace-a",
    );

    expect(receive).toHaveBeenCalledOnce();
  });
});
