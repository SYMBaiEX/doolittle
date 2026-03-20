import { describe, expect, it } from "bun:test";
import { normalizeInboundMessage } from "./message-normalization";

describe("normalizeInboundMessage", () => {
  it("normalizes telegram messages", () => {
    const message = normalizeInboundMessage("telegram", {
      message: {
        message_id: 42,
        text: "hello telegram",
        chat: { id: 1001, type: "group", title: "Team Chat" },
        from: { id: 7, username: "agent", first_name: "Eliza", last_name: "Agent" },
        reply_to_message: { message_id: 12 },
        date: 1710000000,
        photo: [{ file_id: "photo-1" }, { file_id: "photo-2" }],
        document: { file_id: "doc-1", file_name: "briefing.pdf", mime_type: "application/pdf", file_size: 2048 },
      },
    });

    expect(message?.platform).toBe("telegram");
    expect(message?.roomId).toBe("1001");
    expect(message?.replyToMessageId).toBe("12");
    expect(message?.metadata?.chatTitle).toBe("Team Chat");
    expect(message?.metadata?.messageId).toBe("42");
    expect(message?.metadata?.attachmentCount).toBe("2");
    expect(message?.metadata?.attachmentKinds).toContain("photo");
    expect(message?.metadata?.attachmentKinds).toContain("document");
    expect(message?.metadata?.attachmentNames).toContain("briefing.pdf");
  });

  it("normalizes discord messages", () => {
    const message = normalizeInboundMessage("discord", {
      content: "hello discord",
      channel_id: "chan-1",
      id: "msg-1",
      author: { id: "user-1", username: "agent", bot: false },
      message_reference: { message_id: "msg-0" },
      guild_id: "guild-1",
      type: 0,
      attachments: [
        {
          id: "att-1",
          filename: "capture.png",
          url: "https://cdn.example.com/capture.png",
          content_type: "image/png",
          size: 1024,
          width: 400,
          height: 300,
        },
      ],
    });

    expect(message?.platform).toBe("discord");
    expect(message?.roomId).toBe("chan-1");
    expect(message?.replyToMessageId).toBe("msg-0");
    expect(message?.metadata?.guildId).toBe("guild-1");
    expect(message?.metadata?.threadId).toBe("msg-0");
    expect(message?.metadata?.attachmentCount).toBe("1");
    expect(message?.metadata?.attachmentKinds).toBe("image");
    expect(message?.metadata?.attachmentNames).toBe("capture.png");
  });

  it("normalizes slack messages", () => {
    const message = normalizeInboundMessage("slack", {
      event: {
        type: "message",
        text: "hello slack",
        channel: "C123",
        user: "U123",
        ts: "1710000000.000100",
        thread_ts: "1710000000.000050",
        channel_type: "channel",
      },
    });

    expect(message?.platform).toBe("slack");
    expect(message?.roomId).toBe("C123");
    expect(message?.threadId).toBe("1710000000.000050");
    expect(message?.metadata?.eventType).toBe("message");
    expect(message?.metadata?.channelType).toBe("channel");
  });

  it("normalizes whatsapp messages", () => {
    const message = normalizeInboundMessage("whatsapp", {
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
                    context: { id: "wamid-parent" },
                    text: { body: "hello whatsapp" },
                    image: { caption: "receipt", mime_type: "image/png", id: "media-1" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(message?.platform).toBe("whatsapp");
    expect(message?.roomId).toBe("15555550123");
    expect(message?.replyToMessageId).toBe("wamid-parent");
    expect(message?.metadata?.replyToId).toBe("wamid-parent");
    expect(message?.metadata?.messageId).toBe("wamid-1");
    expect(message?.metadata?.attachmentCount).toBe("1");
    expect(message?.metadata?.attachmentKinds).toBe("image");
    expect(message?.metadata?.attachmentNames).toBe("receipt");
  });

  it("normalizes signal messages", () => {
    const message = normalizeInboundMessage("signal", {
      sender: "+15555550123",
      conversation_id: "thread-1",
      message: "hello",
      reply_to: "msg-9",
    });

    expect(message?.platform).toBe("signal");
    expect(message?.roomId).toBe("thread-1");
    expect(message?.replyToMessageId).toBe("msg-9");
  });

  it("normalizes matrix messages", () => {
    const message = normalizeInboundMessage("matrix", {
      sender: "@user:example.com",
      room_id: "!room:example.com",
      content: { body: "hello matrix" },
      relates_to: { event_id: "$parent" },
    });

    expect(message?.platform).toBe("matrix");
    expect(message?.roomId).toBe("!room:example.com");
    expect(message?.replyToMessageId).toBe("$parent");
  });

  it("normalizes sms messages", () => {
    const message = normalizeInboundMessage("sms", {
      From: "+15555550123",
      To: "+15555550999",
      Body: "ping",
      MessageSid: "SM123",
    });

    expect(message?.platform).toBe("sms");
    expect(message?.roomId).toBe("+15555550999");
    expect(message?.messageId).toBe("SM123");
  });
});
