import { describe, expect, it, vi } from "vitest";
import { DeliveryService } from "@/services/delivery-service";
import { NativeMessageConnectorAdapter } from "./native-message-connector-adapter";

describe("NativeMessageConnectorAdapter", () => {
  it("sends connector content with external reply metadata and records returned metadata", async () => {
    const sendMessageToTarget = vi.fn().mockResolvedValue({
      metadata: { externalMessageId: "native-42", messageIdFull: "native-42" },
    });
    const adapter = new NativeMessageConnectorAdapter(
      "discord",
      {
        getMessageConnectors: () => [
          {
            source: "discord",
            label: "Discord",
            capabilities: ["send_message"],
            supportedTargetKinds: [],
            contexts: [],
          },
        ],
        sendMessageToTarget,
      } as never,
      new DeliveryService("/tmp/doolittle-native-connector-test"),
    );

    const record = await adapter.send({
      roomId: "channel-1",
      text: "hello",
      replyToId: "reply-1",
    });

    expect(sendMessageToTarget).toHaveBeenCalledWith(
      { source: "discord", channelId: "channel-1", threadId: undefined },
      expect.objectContaining({
        text: "hello",
        replyToExternalMessageId: "reply-1",
      }),
    );
    expect(record.metadata).toMatchObject({ externalMessageId: "native-42" });
    expect(adapter.edit).toBeUndefined();
  });

  it("only exposes edits when the connector advertises edit_message", () => {
    const editMessageOnTarget = vi.fn().mockResolvedValue({
      metadata: { platformMessageId: "native-42" },
    });
    const delivery = new DeliveryService(
      "/tmp/doolittle-native-connector-edit-test",
    );
    const adapter = new NativeMessageConnectorAdapter(
      "discord",
      {
        getMessageConnectors: () => [
          {
            source: "discord",
            label: "Discord",
            capabilities: ["send_message", "edit_message"],
            supportedTargetKinds: [],
            contexts: [],
            editHandler: async () => undefined,
          },
        ],
        editMessageOnTarget,
      } as never,
      delivery,
    );

    expect(adapter.edit).toBeTypeOf("function");

    const record = delivery.deliver(
      { platform: "discord", channelId: "channel-1", mode: "explicit" },
      "before",
      { metadata: { platformMessageId: "native-42" } },
    );
    return expect(
      adapter.edit?.(record, { roomId: "channel-1", text: "after" }),
    ).resolves.toMatchObject({ text: "after" });
  });
});
