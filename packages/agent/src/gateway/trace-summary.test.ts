import { describe, expect, it } from "bun:test";
import {
  countByKind,
  countByPlatform,
  countByString,
  summarizeTransportJournalEntry,
} from "./trace-summary";

describe("gateway trace summary helpers", () => {
  it("summarizes transport journal entries with stable detail formatting", () => {
    const summary = summarizeTransportJournalEntry(
      {
        platform: "api",
        source: "custom",
        operational: true,
        ready: false,
        transportState: "degraded",
        status: "idle",
        restartCount: 2,
        restartFailures: 1,
        backoffUntilAt: "2026-03-28T12:00:00.000Z",
        traceCount: 5,
        inboxCount: 3,
        outboxCount: 2,
        attachmentCount: 1,
        mismatchFlags: ["inventory-operational-mismatch"],
        lastTraceKind: "deliver",
        lastEventKind: "heartbeat",
        nativeMessagingSummary: "live runtime bridge",
      },
      "2026-03-28T11:59:00.000Z",
    );

    expect(summary).toContain("api: source=custom");
    expect(summary).toContain("restarts=2");
    expect(summary).toContain("failures=1");
    expect(summary).toContain("mismatches=inventory-operational-mismatch");
    expect(summary).toContain("native=live runtime bridge");
  });

  it("counts platforms, kinds, and string groups in descending frequency", () => {
    const platforms = countByPlatform(
      [
        { platform: "api" as const },
        { platform: "telegram" as const },
        { platform: "api" as const },
      ],
      (record) => record.platform,
    );
    const kinds = countByKind(
      [
        { kind: "deliver" as const },
        { kind: "route" as const },
        { kind: "deliver" as const },
      ],
      (record) => record.kind,
    );
    const strings = countByString(
      [{ kind: "image" }, { kind: "pdf" }, { kind: "image" }],
      (record) => record.kind,
    );

    expect(platforms).toEqual([
      { platform: "api", count: 2 },
      { platform: "telegram", count: 1 },
    ]);
    expect(kinds).toEqual([
      { kind: "deliver", count: 2 },
      { kind: "route", count: 1 },
    ]);
    expect(strings).toEqual([
      { kind: "image", count: 2 },
      { kind: "pdf", count: 1 },
    ]);
  });
});
