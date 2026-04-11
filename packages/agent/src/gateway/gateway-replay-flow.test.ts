import { describe, expect, it } from "bun:test";
import type { GatewayInboxRecord } from "./read/history-view";
import {
  type GatewayInboxReplayTransportDetail,
  replayGatewayInboxRecord,
} from "./receive/replay";

describe("gateway-replay-flow", () => {
  it("replays an inbox record through receive and transport lookups", async () => {
    const inboxRecord = {
      recordId: "inbox-1",
      at: "2026-03-29T12:10:00.000Z",
      platform: "api",
      userId: "user-1",
      roomId: "room-1",
      textPreview: "original text",
      metadata: {
        source: "gateway",
      },
    } as unknown as GatewayInboxRecord;
    let receivedMessage:
      | {
          platform: string;
          roomId: string;
          text: string;
          metadata?: Record<string, string>;
        }
      | undefined;

    const result = await replayGatewayInboxRecord({
      record: inboxRecord,
      receive: async (message) => {
        receivedMessage = message;
        return {
          ok: true,
          response: "replayed",
          sessionId: "session-1",
          traceId: "trace-1",
          deliveryId: "delivery-1",
        };
      },
      transport: async () =>
        ({
          platform: "api",
          inventory: {
            source: "official",
            operational: true,
          },
          platformState: {
            transportState: "live",
            nativePluginSource: "official",
            lastUpdatedAt: "2026-03-29T12:10:02.000Z",
          },
          readiness: {
            ready: true,
            status: "running",
          },
          traceCount: 4,
          inboxCount: 1,
          outboxCount: 2,
          attachmentCount: 0,
          mismatchFlags: [],
        }) as GatewayInboxReplayTransportDetail,
    });

    expect(receivedMessage).toMatchObject({
      platform: "api",
      roomId: "room-1",
      text: "original text",
      metadata: {
        source: "gateway",
        replayedFromRecordId: "inbox-1",
      },
    });
    expect(receivedMessage?.metadata?.replayedAt).toBeDefined();
    expect(result).toMatchObject({
      ok: true,
      response: "replayed",
      sessionId: "session-1",
      traceId: "trace-1",
      deliveryId: "delivery-1",
      transportDetail: {
        platform: "api",
      },
    });
    expect(result.transportSummary).toContain("api: source=official");
    expect(result.transportSummary).toContain("transportState=live");
    expect(result.transportSummary).toContain("traces=4");
  });
});
