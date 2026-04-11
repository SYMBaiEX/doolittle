import { describe, expect, it } from "bun:test";
import type { PlatformName } from "@/types/gateway";
import {
  buildGatewayDaemonRuntimeState,
  computeGatewayRestartBackoffMs,
  createGatewayRestartState,
  ensureGatewayRestartState,
  GATEWAY_DAEMON_POLICY,
  type GatewayRestartState,
  nextGatewayBackoffEligibility,
} from "./daemon-state";

describe("gateway daemon state helpers", () => {
  it("creates and reuses restart state entries per platform", () => {
    const states = new Map();
    const first = ensureGatewayRestartState(
      states,
      "telegram",
      GATEWAY_DAEMON_POLICY,
    );
    const second = ensureGatewayRestartState(
      states,
      "telegram",
      GATEWAY_DAEMON_POLICY,
    );

    expect(first).toBe(second);
    expect(first).toEqual(createGatewayRestartState(GATEWAY_DAEMON_POLICY));
  });

  it("computes bounded restart backoff and next eligibility timestamps", () => {
    expect(computeGatewayRestartBackoffMs(GATEWAY_DAEMON_POLICY, 1)).toBe(5625);
    expect(computeGatewayRestartBackoffMs(GATEWAY_DAEMON_POLICY, 20)).toBe(
      GATEWAY_DAEMON_POLICY.restartMaxDelayMs,
    );
    expect(
      nextGatewayBackoffEligibility(
        GATEWAY_DAEMON_POLICY,
        2,
        Date.UTC(2026, 2, 29, 12, 0, 0),
      ),
    ).toBe("2026-03-29T12:00:10.750Z");
  });

  it("builds daemon runtime snapshots from restart state and watchdog counts", () => {
    const restartBackoffByPlatform = new Map<PlatformName, GatewayRestartState>(
      [
        [
          "telegram",
          {
            failures: 2,
            lastRestartAt: "2026-03-29T12:00:00.000Z",
            nextEligibleAt: "2026-03-29T12:00:11.250Z",
            lastAction: "recover" as const,
            backoffMs: 11_250,
          },
        ],
      ],
    );

    const snapshot = buildGatewayDaemonRuntimeState({
      policy: GATEWAY_DAEMON_POLICY,
      state: {
        heartbeatRuns: 3,
        watchdogRuns: 4,
        restartRuns: 1,
        restartRecoveries: 1,
        restartBackoffs: 0,
        watchdogSkips: 0,
        lastWatchdogAt: "2026-03-29T12:01:00.000Z",
        lastReason: "watchdog",
      },
      restartBackoffByPlatform,
      running: true,
      activePlatforms: 2,
      unhealthyPlatforms: 1,
      backoffPlatforms: 1,
    });

    expect(snapshot.restartQueue).toEqual([
      {
        platform: "telegram",
        failures: 2,
        lastRestartAt: "2026-03-29T12:00:00.000Z",
        nextEligibleAt: "2026-03-29T12:00:11.250Z",
        backoffMs: 11_250,
        action: "recover",
      },
    ]);
    expect(snapshot.watchdog).toEqual({
      running: true,
      activePlatforms: 2,
      unhealthyPlatforms: 1,
      restartablePlatforms: 2,
      backoffPlatforms: 1,
      lastWatchdogAt: "2026-03-29T12:01:00.000Z",
      lastReason: "watchdog",
    });
  });
});
