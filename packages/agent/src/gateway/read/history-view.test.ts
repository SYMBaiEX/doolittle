import { describe, expect, it } from "bun:test";
import type {
  DeliveredMessageRecord,
  PlatformName,
  SessionRoute,
} from "@/types/gateway";
import { GatewayHistoryView } from "./history-view";

describe("gateway history view", () => {
  it("builds platform-scoped snapshots with stable newest-first ordering", () => {
    const view = new GatewayHistoryView({
      traceLog: [
        {
          traceId: "a1",
          at: "2026-03-29T10:00:00.000Z",
          kind: "receive",
          platform: "api",
          detail: "api inbound",
          sessionId: "s1",
          userId: "u1",
          roomId: "r1",
        },
        {
          traceId: "a2",
          at: "2026-03-29T10:05:00.000Z",
          kind: "route",
          platform: "telegram",
          detail: "tg route",
          roomId: "r2",
          userId: "u2",
          sessionId: "s2",
        },
        {
          traceId: "a3",
          at: "2026-03-29T10:10:00.000Z",
          kind: "respond",
          platform: "api",
          detail: "api respond",
          roomId: "r3",
          userId: "u3",
          sessionId: "s3",
        },
      ],
      inboxLog: [
        {
          recordId: "i1",
          at: "2026-03-29T10:01:00.000Z",
          platform: "api",
          sessionId: "s1",
          traceId: "a1",
          status: "received",
          userId: "u1",
          roomId: "r1",
          textPreview: "one",
          attachmentCount: 0,
          attachmentKinds: [],
          attachmentNames: [],
          attachmentUrls: [],
          attachmentMimeTypes: [],
          metadataKeys: [],
          metadata: {},
        },
        {
          recordId: "i2",
          at: "2026-03-29T10:11:00.000Z",
          platform: "api",
          sessionId: "s3",
          traceId: "a3",
          status: "accepted",
          userId: "u3",
          roomId: "r3",
          textPreview: "three",
          attachmentCount: 0,
          attachmentKinds: [],
          attachmentNames: [],
          attachmentUrls: [],
          attachmentMimeTypes: [],
          metadataKeys: [],
          metadata: {},
        },
      ],
      outboxLog: [
        {
          recordId: "o1",
          at: "2026-03-29T10:02:00.000Z",
          platform: "api",
          sessionId: "s1",
          traceId: "a1",
          status: "sent",
          roomId: "r1",
          textPreview: "reply",
          attachmentCount: 0,
          attachmentKinds: [],
          attachmentNames: [],
          attachmentUrls: [],
          attachmentMimeTypes: [],
          metadataKeys: [],
          metadata: {},
        },
      ],
      attachmentLog: [
        {
          attachmentId: "x1",
          recordId: "i1",
          at: "2026-03-29T10:01:00.000Z",
          direction: "inbox",
          platform: "api",
          sessionId: "s1",
          traceId: "a1",
          kind: "image",
          roomId: "r1",
          metadataKeys: [],
          metadata: {},
          userId: "u1",
        },
        {
          attachmentId: "x2",
          recordId: "i2",
          at: "2026-03-29T10:12:00.000Z",
          direction: "inbox",
          platform: "telegram",
          sessionId: "s2",
          traceId: "a2",
          kind: "audio",
          roomId: "r2",
          metadataKeys: [],
          metadata: {},
          userId: "u2",
        },
      ],
      recentDeliveries: (limit: number) => {
        const deliveries: DeliveredMessageRecord[] = [];
        for (let i = 0; i < 80; i += 1) {
          deliveries.push({
            id: `${i}`,
            target: {
              platform: (i % 2 === 0 ? "api" : "telegram") as PlatformName,
              channelId: `c${i}`,
              userId: `u${i}`,
              mode: "explicit" as const,
            },
            text: `msg-${i}`,
            createdAt: `2026-03-29T10:${String(20 + i).padStart(
              2,
              "0",
            )}:00.000Z`,
          });
        }
        return deliveries.slice(-limit);
      },
      listSessions: () =>
        [
          {
            sessionKey: "api-1",
            roomId: "r1",
            userId: "u1",
            platform: "api",
            updatedAt: "2026-03-29T10:03:00.000Z",
          },
          {
            sessionKey: "api-2",
            roomId: "r2",
            userId: "u2",
            platform: "telegram",
            updatedAt: "2026-03-29T10:08:00.000Z",
          },
          {
            sessionKey: "api-3",
            roomId: "r3",
            userId: "u3",
            platform: "api",
            updatedAt: "2026-03-29T10:09:00.000Z",
          },
        ] as unknown as SessionRoute[],
    });

    const snapshot = view.snapshotWindow(2, {
      platform: "api",
      kind: "receive",
    });

    expect(snapshot.allTraces.map((entry) => entry.traceId)).toEqual(["a1"]);
    expect(snapshot.traces.map((entry) => entry.traceId)).toEqual(["a1"]);
    expect(snapshot.inbox.map((entry) => entry.recordId)).toEqual(["i2", "i1"]);
    expect(snapshot.outbox.map((entry) => entry.recordId)).toEqual(["o1"]);
    expect(snapshot.deliveries).toHaveLength(2);
    expect(
      snapshot.deliveries.every(
        (delivery) => delivery.target.platform === "api",
      ),
    ).toBe(true);
    expect(snapshot.sessions.map((session) => session.sessionKey)).toEqual([
      "api-3",
      "api-1",
    ]);
  });

  it("keeps trace/inbox/outbox/attachment ordering consistent with limit/reverse behavior", () => {
    const view = new GatewayHistoryView({
      traceLog: [
        {
          traceId: "1",
          at: "2026-03-29T10:00:00.000Z",
          kind: "receive",
          platform: "api",
          detail: "first",
          roomId: "r",
          userId: "u",
        },
        {
          traceId: "2",
          at: "2026-03-29T10:01:00.000Z",
          kind: "route",
          platform: "api",
          detail: "second",
          roomId: "r",
          userId: "u",
        },
        {
          traceId: "3",
          at: "2026-03-29T10:02:00.000Z",
          kind: "respond",
          platform: "api",
          detail: "third",
          roomId: "r",
          userId: "u",
        },
      ],
      inboxLog: [],
      outboxLog: [],
      attachmentLog: [],
      recentDeliveries: () => [],
      listSessions: () => [],
    });

    expect(view.trace(2).map((entry) => entry.traceId)).toEqual(["3", "2"]);
    expect(view.inbox(2).length).toBe(0);
    expect(view.outbox(2).length).toBe(0);
    expect(view.attachments(2).length).toBe(0);
  });

  it("uses recent delivery backoff limits and platform filtering", () => {
    const seenLimit: number[] = [];
    const view = new GatewayHistoryView({
      traceLog: [],
      inboxLog: [],
      outboxLog: [],
      attachmentLog: [],
      recentDeliveries: (limit) => {
        seenLimit.push(limit);
        return [
          ...Array.from({ length: 120 }).map((_, index) => ({
            id: `${index}`,
            target: {
              platform: (index % 2 ? "telegram" : "api") as PlatformName,
              channelId: "c",
              userId: "u",
              mode: "explicit" as const,
            },
            text: `m${index}`,
            createdAt: `2026-03-29T11:${String(index).padStart(2, "0")}:00.000Z`,
          })),
        ];
      },
      listSessions: () => [],
    });

    const deliveries = view.snapshotWindow(20, { platform: "api" }).deliveries;

    expect(seenLimit).toEqual([80]);
    expect(deliveries).toHaveLength(20);
    expect(
      deliveries.every((delivery) => delivery.target.platform === "api"),
    ).toBe(true);
  });

  it("sorts sessions by newest updatedAt before limiting", () => {
    const view = new GatewayHistoryView({
      traceLog: [],
      inboxLog: [],
      outboxLog: [],
      attachmentLog: [],
      recentDeliveries: () => [],
      listSessions: () =>
        [
          {
            sessionKey: "s1",
            roomId: "r1",
            userId: "u1",
            platform: "api",
            updatedAt: "2026-03-29T08:00:00.000Z",
          },
          {
            sessionKey: "s2",
            roomId: "r2",
            userId: "u2",
            platform: "api",
            updatedAt: "2026-03-29T10:00:00.000Z",
          },
          {
            sessionKey: "s3",
            roomId: "r3",
            userId: "u3",
            platform: "telegram",
            updatedAt: "2026-03-29T12:00:00.000Z",
          },
        ] as unknown as SessionRoute[],
    });

    expect(
      view
        .snapshotWindow(10, { platform: "api" })
        .sessions.map((session) => session.sessionKey),
    ).toEqual(["s2", "s1"]);
  });
});
