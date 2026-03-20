import { describe, expect, it } from "bun:test";
import { normalizeInboundMessage } from "./message-normalization";

describe("normalizeInboundMessage", () => {
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
