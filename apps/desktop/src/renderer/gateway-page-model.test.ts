import { describe, expect, it } from "vitest";
import {
  approvedPairingSenders,
  buildGatewayTimeline,
  filterGatewayTimeline,
  gatewayActionFeedback,
  gatewayStatusTone,
  pairingRequests,
} from "./gateway-page-model";

describe("gateway page timeline model", () => {
  it("merges recorded inbound and outbound messages in newest-first order", () => {
    const entries = buildGatewayTimeline(
      [
        {
          recordId: "inbox-1",
          at: "2026-07-27T10:00:00.000Z",
          platform: "discord",
          status: "accepted",
          roomId: "support",
          textPreview: "Please investigate this.",
        },
      ],
      [
        {
          recordId: "outbox-1",
          at: "2026-07-27T10:01:00.000Z",
          platform: "discord",
          status: "sent",
          roomId: "support",
          textPreview: "I am on it.",
        },
      ],
    );

    expect(entries.map((entry) => entry.id)).toEqual(["outbox-1", "inbox-1"]);
    expect(entries[1]).toMatchObject({ direction: "inbox", roomId: "support" });
  });

  it("filters by direction, platform, and recorded thread metadata", () => {
    const entries = buildGatewayTimeline(
      [
        {
          recordId: "inbox-1",
          at: "2026-07-27T10:00:00.000Z",
          platform: "discord",
          sessionId: "discord:support:alex:thread-1",
          threadId: "thread-1",
          status: "received",
        },
      ],
      [
        {
          recordId: "outbox-1",
          at: "2026-07-27T10:01:00.000Z",
          platform: "slack",
          status: "sent",
        },
      ],
    );

    expect(
      filterGatewayTimeline(entries, {
        direction: "inbox",
        platform: "discord",
        query: "thread-1",
      }),
    ).toHaveLength(1);
    expect(gatewayStatusTone("rejected")).toBe("bad");
  });

  it("only renders complete official pairing records", () => {
    expect(
      pairingRequests([
        {
          id: "request-1",
          platform: "telegram",
          userId: "alice",
          code: "ABCDEFGH",
          createdAt: "2026-08-09T10:00:00.000Z",
        },
        { id: "incomplete", platform: "telegram" },
      ]),
    ).toEqual([
      {
        id: "request-1",
        platform: "telegram",
        userId: "alice",
        code: "ABCDEFGH",
        createdAt: "2026-08-09T10:00:00.000Z",
      },
    ]);
    expect(
      approvedPairingSenders([
        {
          id: "allow-1",
          platform: "telegram",
          userId: "alice",
          approvedAt: "2026-08-09T10:10:00.000Z",
        },
      ]),
    ).toMatchObject([{ id: "allow-1", userId: "alice" }]);
  });

  it("keeps action success and failure feedback truthful", () => {
    expect(gatewayActionFeedback("approve")).toMatchObject({ tone: "good" });
    expect(gatewayActionFeedback("revoke", "runtime offline")).toEqual({
      message: "Pairing update could not be completed: runtime offline",
      tone: "bad",
    });
    expect(gatewayActionFeedback("replay", "record expired")).toEqual({
      message: "Replay could not be completed: record expired",
      tone: "bad",
    });
  });
});
