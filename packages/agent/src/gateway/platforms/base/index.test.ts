import { describe, expect, it } from "bun:test";
import {
  buildConfiguredTransportHealth,
  capabilitiesForPlatform,
  createLifecycleHistory,
  describeTransportHealth,
  formatTransportDisplayName,
  trackTransportStart,
} from "./index";

describe("gateway platform base", () => {
  it("formats transport display names", () => {
    expect(formatTransportDisplayName("telegram")).toBe("Telegram");
    expect(formatTransportDisplayName("cli")).toBe("CLI");
  });

  it("describes transport health with platform and counters", () => {
    expect(describeTransportHealth("discord", "running", 7, true)).toBe(
      "Discord health check: status=running sends=7 ready=true.",
    );
  });

  it("builds configured transport health", () => {
    const health = buildConfiguredTransportHealth({
      platform: "api",
      status: "running",
      configured: true,
      configuredDetail: "api ready",
      runningDetail: "api running",
      missingDetail: "api missing",
      sendCount: 12,
      events: [],
      capabilities: capabilitiesForPlatform("api"),
      stoppedDetail: "stopped",
    });

    expect(health).toMatchObject({
      platform: "api",
      status: "running",
      ready: true,
      detail: "api running",
      mode: "native",
    });
  });

  it("returns configured detail when missing transport is not configured", () => {
    const health = buildConfiguredTransportHealth({
      platform: "sms",
      status: "stopped",
      configured: false,
      configuredDetail: "configured",
      runningDetail: "running",
      missingDetail: "missing token",
      sendCount: 0,
      events: [],
      capabilities: capabilitiesForPlatform("sms"),
    });

    expect(health).toMatchObject({
      platform: "sms",
      status: "stopped",
      ready: false,
      detail: "missing token",
      mode: "native",
    });
  });

  it("tracks lifecycle history size and ordering", () => {
    const history = createLifecycleHistory(2);
    history.record("start", "first");
    history.record("send", "second");
    history.record("deliver", "third");

    expect(history.total()).toBe(2);
    expect(history.recent()).toEqual([
      {
        at: expect.any(String),
        kind: "deliver",
        detail: "third",
      },
      {
        at: expect.any(String),
        kind: "send",
        detail: "second",
      },
    ]);
  });

  it("tracks transport start state transitions", () => {
    const historyEvents: Array<{ kind: string; detail: string }> = [];
    const historyRecords: Array<{ kind: string; detail: string; at: string }> =
      [];
    const history = {
      record: (kind: string, detail: string) => {
        historyEvents.push({ kind, detail });
        historyRecords.push({
          at: "2026-03-30T00:00:00.000Z",
          kind,
          detail,
        });
        return {
          at: "2026-03-30T00:00:00.000Z",
          kind: kind as "start" | "error",
          detail,
        };
      },
      recent: () => [],
      total: () => historyEvents.length,
    };

    const started = trackTransportStart(
      "api",
      true,
      "api started",
      "missing",
      history,
    );

    expect(started.status).toBe("running");
    expect(started.startedAt).toBeTypeOf("string");
    expect(historyRecords[0]?.at).toBeTypeOf("string");
    expect(historyEvents).toEqual([
      { kind: "start", detail: "api: api started" },
    ]);

    const stopped = trackTransportStart(
      "api",
      false,
      "unused",
      "not configured",
      history,
    );

    expect(stopped.status).toBe("stopped");
    expect(stopped.lastError).toBe("not configured");
    expect(stopped.startedAt).toBeUndefined();
    expect(historyEvents).toEqual([
      { kind: "start", detail: "api: api started" },
      { kind: "error", detail: "api: not configured" },
    ]);
  });
});
