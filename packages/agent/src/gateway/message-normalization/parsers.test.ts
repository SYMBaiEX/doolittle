import { describe, expect, it } from "bun:test";
import {
  parseDingtalkMessage,
  parseDiscordMessage,
  parseEmailMessage,
  parseHomeAssistantMessage,
  parseMatrixMessage,
  parseMattermostMessage,
  parseSignalMessage,
  parseSlackMessage,
  parseTelegramMessage,
  parseWhatsAppMessage,
} from "./parsers";

describe("message normalization parser seams", () => {
  it("normalizes email payloads with attachment metadata", () => {
    const message = parseEmailMessage({
      from: "agent@example.com",
      to: "team@example.com",
      subject: "Status update",
      html: "<p>Hello from email</p>",
      message_id: "msg-1",
      in_reply_to: "msg-0",
      timestamp: "2026-03-30T00:00:00.000Z",
      sender_name: "Agent",
      attachments: [
        {
          filename: "report.pdf",
          url: "https://example.com/report.pdf",
          content_type: "application/pdf",
          size: 2048,
        },
      ],
    });

    expect(message?.platform).toBe("email");
    expect(message?.roomId).toBe("team@example.com");
    expect(message?.metadata?.subject).toBe("Status update");
    expect(message?.metadata?.attachmentCount).toBe("1");
    expect(message?.metadata?.attachmentNames).toContain("report.pdf");
  });

  it("normalizes mattermost payloads with file ids and props", () => {
    const message = parseMattermostMessage({
      post: {
        id: "post-1",
        message: "hello mattermost",
        channel_id: "channel-1",
        root_id: "root-1",
        user_id: "user-1",
        file_ids: ["file-1", "file-2"],
        props: { severity: "high" },
      },
      sender_name: "Agent",
      channel_name: "ops",
      team_domain: "doolittle",
    });

    expect(message?.platform).toBe("mattermost");
    expect(message?.replyToMessageId).toBe("root-1");
    expect(message?.metadata?.fileIds).toBe("file-1|file-2");
    expect(message?.metadata?.propKeys).toContain("severity");
  });

  it("normalizes home assistant and dingtalk platform payloads", () => {
    const homeAssistant = parseHomeAssistantMessage({
      event: {
        event_type: "mobile_app_notification_action",
        data: {
          message: "Front door opened",
          channel: "alerts",
          user_id: "user-1",
          thread_id: "thread-1",
          reply_to_id: "reply-1",
        },
        context: {
          id: "ctx-1",
        },
      },
    });
    expect(homeAssistant?.platform).toBe("homeassistant");
    expect(homeAssistant?.threadId).toBe("thread-1");
    expect(homeAssistant?.metadata?.eventType).toBe(
      "mobile_app_notification_action",
    );

    const dingtalk = parseDingtalkMessage({
      text: { content: "hello dingtalk" },
      senderId: "sender-1",
      senderNick: "Agent",
      conversationId: "conversation-1",
      msgId: "msg-1",
      sessionWebhookExpiredTime: 1710000000,
    });
    expect(dingtalk?.platform).toBe("dingtalk");
    expect(dingtalk?.messageId).toBe("msg-1");
    expect(dingtalk?.metadata?.authorName).toBe("Agent");
    expect(dingtalk?.metadata?.sessionWebhookExpiredTime).toBe("1710000000");
  });

  it("normalizes telegram payloads with author fallback and media metadata", () => {
    const message = parseTelegramMessage({
      message: {
        message_id: 55,
        text: "hello telegram",
        chat: { id: 1001, type: "group", title: "Ops" },
        from: { id: 7, first_name: "Eliza", last_name: "Agent" },
        voice: {
          file_id: "voice-1",
          mime_type: "audio/ogg",
          duration: 4,
          file_size: 128,
        },
        sticker: { file_id: "sticker-1", emoji: "sparkles" },
      },
    });

    expect(message?.platform).toBe("telegram");
    expect(message?.authorName).toBe("Eliza Agent");
    expect(message?.metadata?.attachmentCount).toBe("2");
    expect(message?.metadata?.attachmentKinds).toContain("voice");
    expect(message?.metadata?.attachmentKinds).toContain("sticker");
    expect(message?.metadata?.attachmentDurationsMs).toContain("4000");
  });

  it("normalizes discord payloads from proxy attachments and skips bots", () => {
    expect(
      parseDiscordMessage({
        content: "hello bot",
        channel_id: "chan-1",
        author: { id: "bot-1", bot: true },
      }),
    ).toBeNull();

    const message = parseDiscordMessage({
      content: "hello discord",
      channel_id: "chan-1",
      id: "msg-1",
      author: { id: "user-1", username: "agent", bot: false },
      attachments: [
        {
          id: "att-1",
          filename: "clip.mp4",
          proxy_url: "https://cdn.example.com/clip.mp4",
          content_type: "video/mp4",
          size: 1024,
          width: 1920,
          height: 1080,
        },
      ],
    });

    expect(message?.metadata?.attachmentKinds).toBe("video");
    expect(message?.metadata?.attachmentUrls).toBe(
      "https://cdn.example.com/clip.mp4",
    );
    expect(message?.metadata?.attachmentWidths).toBe("1920");
  });

  it("normalizes slack and signal payloads with shared attachment helpers", () => {
    expect(
      parseSlackMessage({
        event: {
          type: "message",
          subtype: "bot_message",
          text: "ignore me",
          channel: "C123",
          user: "U123",
        },
      }),
    ).toBeNull();

    const slackMessage = parseSlackMessage({
      event: {
        type: "message",
        subtype: "file_share",
        text: "hello slack",
        channel: "C123",
        user: "U123",
        files: [
          {
            id: "file-1",
            name: "song.mp3",
            url_private: "https://slack.example.com/song.mp3",
            mimetype: "audio/mpeg",
            size: 12,
          },
        ],
      },
    });
    expect(slackMessage?.metadata?.attachmentKinds).toBe("audio");
    expect(slackMessage?.metadata?.attachmentNames).toBe("song.mp3");

    const signalMessage = parseSignalMessage({
      from: "+15555550123",
      body: "hello signal",
      reply_to: "msg-9",
      attachments: [
        {
          id: "attachment-1",
          filename: "voice.ogg",
          content_type: "audio/ogg",
          data: "data:audio/ogg;base64,AAAA",
          size: 42,
        },
      ],
    });
    expect(signalMessage?.threadId).toBe("msg-9");
    expect(signalMessage?.metadata?.attachmentKinds).toBe("audio");
    expect(signalMessage?.metadata?.attachmentUrls).toContain("data:audio/ogg");
  });

  it("normalizes whatsapp and matrix media payloads", () => {
    const whatsAppMessage = parseWhatsAppMessage({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid-1",
                    from: "15555550123",
                    timestamp: "1710000001",
                    text: { body: "hello whatsapp" },
                    document: {
                      filename: "briefing.pdf",
                      mime_type: "application/pdf",
                      id: "media-1",
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(whatsAppMessage?.metadata?.attachmentKinds).toBe("document");
    expect(whatsAppMessage?.metadata?.attachmentNames).toBe("briefing.pdf");

    const matrixMessage = parseMatrixMessage({
      sender: "@user:example.com",
      room_id: "!room:example.com",
      content: { body: "hello matrix" },
      event_id: "$event",
      url: "mxc://example.com/video",
      filename: "clip.mp4",
      msgtype: "m.video",
      info: { mimetype: "video/mp4", size: 2048, w: 1280, h: 720 },
    });
    expect(matrixMessage?.metadata?.attachmentKinds).toBe("video");
    expect(matrixMessage?.metadata?.attachmentWidths).toBe("1280");
    expect(matrixMessage?.metadata?.attachmentHeights).toBe("720");
  });
});
