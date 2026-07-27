import { describe, expect, it } from "bun:test";
import {
  buildGatewayTimeline,
  filterGatewayTimeline,
  gatewayStatusTone,
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
});
