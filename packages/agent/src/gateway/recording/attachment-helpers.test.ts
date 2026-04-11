import { describe, expect, it } from "bun:test";
import type { PlatformName } from "@/types/gateway";
import {
  buildGatewayJournalAttachments,
  splitGatewayAttachmentList,
} from "./attachment-helpers";

describe("gateway attachment helpers", () => {
  it("splits attachment metadata using pipe and comma delimiters", () => {
    expect(splitGatewayAttachmentList(undefined)).toEqual([]);
    expect(splitGatewayAttachmentList("image|doc|voice")).toEqual([
      "image",
      "doc",
      "voice",
    ]);
    expect(splitGatewayAttachmentList("a,b, c")).toEqual(["a", "b", "c"]);
    expect(splitGatewayAttachmentList("a|b, c , ,d||  ")).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("builds journal attachment rows aligned to attachmentCount and metadata fallbacks", () => {
    const records = buildGatewayJournalAttachments({
      direction: "inbox",
      platform: "signal" as PlatformName,
      recordId: "record-1",
      traceId: "trace-1",
      at: "2026-03-30T00:00:00.000Z",
      source: {
        sessionId: "session-1",
        messageId: "msg-1",
        userId: "user-1",
        roomId: "room-1",
        threadId: "thread-1",
        replyToMessageId: "reply-1",
        metadata: {
          attachmentKinds: "image|document",
          attachmentNames: "cover",
          attachmentSizes: "128|256",
          attachmentCount: "3",
          attachmentMimeTypes: "image/png",
          attachmentType: "media",
          attachmentName: "fallback-name",
          attachmentUrl: "https://fallback.url",
        },
      },
    });

    expect(records).toHaveLength(3);
    expect(records[0]).toEqual(
      expect.objectContaining({
        attachmentId: "record-1:1",
        direction: "inbox",
        platform: "signal",
        kind: "image",
        name: "cover",
        url: "https://fallback.url",
        size: "128",
        mimeType: "image/png",
        metadata: {
          attachmentKinds: "image|document",
          attachmentNames: "cover",
          attachmentSizes: "128|256",
          attachmentCount: "3",
          attachmentMimeTypes: "image/png",
          attachmentType: "media",
          attachmentName: "fallback-name",
          attachmentUrl: "https://fallback.url",
        },
        metadataKeys: expect.arrayContaining([
          "attachmentKinds",
          "attachmentNames",
          "attachmentSizes",
          "attachmentCount",
          "attachmentMimeTypes",
          "attachmentType",
          "attachmentName",
          "attachmentUrl",
        ]),
      }),
    );
    expect(records[1]).toEqual(
      expect.objectContaining({
        attachmentId: "record-1:2",
        kind: "document",
        name: "fallback-name",
      }),
    );
    expect(records[2]).toEqual(
      expect.objectContaining({
        attachmentId: "record-1:3",
        kind: "media",
        name: "fallback-name",
        url: "https://fallback.url",
      }),
    );
  });

  it("infers attachment count from parallel metadata lists", () => {
    const records = buildGatewayJournalAttachments({
      direction: "outbox",
      platform: "telegram" as PlatformName,
      recordId: "record-2",
      traceId: "trace-2",
      source: {
        deliveryId: "delivery-2",
        userId: "user-2",
        roomId: "room-2",
        metadata: {
          attachmentKinds: "image",
          attachmentUrls: "https://a.example, https://b.example",
          attachmentWidths: "100|200",
          attachmentHeights: "10|20",
          attachmentCaptions: "front|back",
        },
      },
    });

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      kind: "image",
      url: "https://a.example",
      width: "100",
      height: "10",
      caption: "front",
      deliveryId: "delivery-2",
    });
    expect(records[1]).toMatchObject({
      kind: "attachment",
      url: "https://b.example",
      width: "200",
      height: "20",
      caption: "back",
      metadataKeys: [
        "attachmentKinds",
        "attachmentUrls",
        "attachmentWidths",
        "attachmentHeights",
        "attachmentCaptions",
      ],
    });
  });
});
