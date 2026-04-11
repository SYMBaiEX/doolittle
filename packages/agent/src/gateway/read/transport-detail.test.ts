import { describe, expect, it } from "bun:test";
import type { GatewayTransportDetail } from "../state/state-snapshot";
import {
  buildGatewayTransportJournalEntry,
  buildGatewayTransportSummaryEntry,
} from "./transport-detail";

describe("gateway transport detail helpers", () => {
  it("maps drilldown entries into summary and journal views", () => {
    const detail = {
      platform: "api",
      inventory: {
        platform: "api",
        source: "official",
        configEnabled: true,
        gatewayEnabled: true,
        operational: true,
        detail: "api transport operational",
      },
      platformState: {
        platform: "api",
        nativePluginSource: "official",
        transportState: "live",
        restartCount: 2,
        restartFailureCount: 1,
        nextRestartAt: "2026-03-30T12:00:00.000Z",
        lastUpdatedAt: "2026-03-30T11:00:00.000Z",
        lastTraceKind: "deliver",
        lastEventKind: "heartbeat",
      },
      readiness: {
        ready: true,
        status: "running",
        detail: "healthy",
      },
      traceCount: 3,
      inboxCount: 2,
      outboxCount: 1,
      attachmentCount: 1,
      mismatchFlags: ["inventory-operational-mismatch"],
    } as unknown as GatewayTransportDetail;

    const summary = buildGatewayTransportSummaryEntry(detail);
    const journal = buildGatewayTransportJournalEntry(detail);

    expect(summary.platform).toBe("api");
    expect(summary.detail).toBe("api transport operational");
    expect(summary.operational).toBe(true);
    expect(summary.ready).toBe(true);

    expect(journal.platform).toBe("api");
    expect(journal.source).toBe("official");
    expect(journal.restartCount).toBe(2);
    expect(journal.summary).toContain("api: source=official");
    expect(journal.summary).toContain(
      "mismatches=inventory-operational-mismatch",
    );
  });
});
