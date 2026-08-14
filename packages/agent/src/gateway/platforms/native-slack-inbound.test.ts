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

  it("applies mention-only mode to channel messages without changing DMs", () => {
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
    ).not.toBeNull();
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
});
