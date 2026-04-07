import { afterEach, describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  OutboundPlatformMessage,
  SessionRoute,
} from "@/types/gateway";
import {
  buildGatewayOutboundForSession,
  buildGatewayOutboundMessageFromDelivery,
  createProgressiveDeliveryQueue,
  shouldUseFreshDelivery,
} from "./builders";

describe("gateway outbound builders", () => {
  const originalNow = Date.now;

  afterEach(() => {
    Date.now = originalNow;
  });

  it("adds voice metadata when a session should speak and merges delivery metadata", async () => {
    const media = {
      speak: async () => ({
        artifactPath: "/tmp/gateway-voice.mp3",
        artifactKind: "mp3" as const,
      }),
    } as unknown as AppContext["services"]["media"];
    const session = {
      platform: "telegram",
      voiceMode: "all",
    } as SessionRoute;
    const outbound: OutboundPlatformMessage = {
      roomId: "room-1",
      userId: "user-1",
      text: "Hello world",
    };
    const delivery = {
      id: "delivery-1",
      target: {
        platform: "telegram",
        channelId: "room-1",
        userId: "user-1",
        mode: "origin",
      },
      text: "Hello world",
      threadId: "thread-1",
      replyToId: "reply-1",
      metadata: { source: "gateway" },
      createdAt: "2026-03-29T00:00:00.000Z",
    } as DeliveredMessageRecord;

    const voiced = await buildGatewayOutboundForSession(
      media,
      session,
      outbound,
      "reply",
    );
    const rebuilt = buildGatewayOutboundMessageFromDelivery(
      delivery,
      "Updated text",
      {
        metadata: { revision: "2" },
        threadId: "thread-2",
        replyToId: "reply-2",
      },
    );

    expect(voiced.metadata).toMatchObject({
      voiceMode: "all",
      audioAsVoice: "true",
      attachmentCount: "1",
      attachmentKinds: "voice",
      attachmentNames: "gateway-voice.mp3",
      attachmentUrls: "/tmp/gateway-voice.mp3",
      attachmentMimeTypes: "audio/mpeg",
    });
    expect(rebuilt).toMatchObject({
      roomId: "room-1",
      userId: "user-1",
      text: "Updated text",
      threadId: "thread-2",
      replyToId: "reply-2",
      metadata: {
        source: "gateway",
        revision: "2",
      },
    });
    expect(shouldUseFreshDelivery(voiced.metadata)).toBe(true);
  });

  it("throttles progressive flushes until the queue is forced or substantially changed", async () => {
    let now = 1_000;
    Date.now = () => now;
    let currentDelivery: DeliveredMessageRecord | undefined;
    let sendCount = 0;
    let editCount = 0;
    const adapter = {
      send: async (outbound: OutboundPlatformMessage) => {
        sendCount += 1;
        currentDelivery = {
          id: `delivery-${sendCount}`,
          target: {
            platform: "api",
            channelId: outbound.roomId,
            userId: outbound.userId,
            mode: "origin",
          },
          text: outbound.text,
          threadId: outbound.threadId,
          replyToId: outbound.replyToId,
          metadata: outbound.metadata,
          createdAt: new Date(now).toISOString(),
        };
        return currentDelivery;
      },
    };
    const message: IncomingPlatformMessage = {
      platform: "api",
      userId: "user-1",
      roomId: "room-1",
      text: "draft",
      metadata: { progressive: "true" },
    };
    const session = {
      sessionKey: "session-1",
      roomId: "room-1",
      userId: "user-1",
      platform: "api",
      createdAt: "2026-03-29T00:00:00.000Z",
      updatedAt: "2026-03-29T00:00:00.000Z",
    } as SessionRoute;
    const queue = createProgressiveDeliveryQueue({
      adapter,
      message,
      session,
      editDelivery: async (deliveryId, text, options) => {
        editCount += 1;
        if (!currentDelivery || currentDelivery.id !== deliveryId) {
          throw new Error("Expected the active delivery to be edited.");
        }
        currentDelivery = {
          ...currentDelivery,
          text,
          threadId: options?.threadId ?? currentDelivery.threadId,
          replyToId: options?.replyToId ?? currentDelivery.replyToId,
          metadata: options?.metadata ?? currentDelivery.metadata,
          updatedAt: new Date(now).toISOString(),
          editOfId: currentDelivery.id,
          editCount: (currentDelivery.editCount ?? 0) + 1,
        };
        return currentDelivery;
      },
    });

    await queue.queueProgressFlush("draft", false);
    now += 50;
    await queue.queueProgressFlush("draft + small increment", false);
    expect(sendCount).toBe(1);
    expect(editCount).toBe(0);

    now += 300;
    await queue.queueProgressFlush("draft + substantial increment", false);
    expect(sendCount).toBe(1);
    expect(editCount).toBe(1);
    expect(queue.getProgressiveDelivery()?.text).toBe(
      "draft + substantial increment",
    );

    now += 10;
    await queue.queueProgressFlush("forced final", true);
    expect(editCount).toBe(2);
    expect(queue.getProgressiveDelivery()?.text).toBe("forced final");
  });
});
