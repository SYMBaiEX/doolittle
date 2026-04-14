import { describe, expect, it } from "bun:test";
import { createTrajectoryLoggerPlugin } from ".";

interface TrajectoryLoggerTestService {
  exportLatest(): unknown;
  bundles(): unknown;
  compareLatest(): unknown;
  stop(): Promise<void>;
}

describe("createTrajectoryLoggerPlugin", () => {
  it("creates a plugin descriptor", () => {
    const plugin = createTrajectoryLoggerPlugin({
      trajectories: {
        exportLatest: () => ({
          dataPath: "/tmp/trajectory.jsonl",
          manifestPath: "/tmp/trajectory-manifest.json",
          summaryPath: "/tmp/trajectory-summary.json",
        }),
        listBundles: () => [],
        compareLatest: () => ({
          left: {
            manifestPath: "/tmp/left-manifest.json",
            dataPath: "/tmp/left.jsonl",
            summaryPath: "/tmp/left-summary.json",
            createdAt: "2026-03-24T00:00:00.000Z",
            label: "left",
            limit: 1,
            messageCount: 1,
            sessionCount: 1,
            sessions: ["session-a"],
            roleCounts: { user: 1 },
          },
          right: {
            manifestPath: "/tmp/right-manifest.json",
            dataPath: "/tmp/right.jsonl",
            summaryPath: "/tmp/right-summary.json",
            createdAt: "2026-03-24T00:00:00.000Z",
            label: "right",
            limit: 1,
            messageCount: 1,
            sessionCount: 1,
            sessions: ["session-b"],
            roleCounts: { assistant: 1 },
          },
          leftReplay: {
            manifestPath: "/tmp/left-manifest.json",
            dataPath: "/tmp/left.jsonl",
            summaryPath: "/tmp/left-summary.json",
            replayPath: "/tmp/left-replay.jsonl",
            replaySummaryPath: "/tmp/left-replay-summary.json",
            replayCount: 1,
            replayPreview: [],
            createdAt: "2026-03-24T00:00:00.000Z",
            label: "left",
            limit: 1,
            messageCount: 1,
            sessionCount: 1,
            sessions: ["session-a"],
            roleCounts: { user: 1 },
          },
          rightReplay: {
            manifestPath: "/tmp/right-manifest.json",
            dataPath: "/tmp/right.jsonl",
            summaryPath: "/tmp/right-summary.json",
            replayPath: "/tmp/right-replay.jsonl",
            replaySummaryPath: "/tmp/right-replay-summary.json",
            replayCount: 1,
            replayPreview: [],
            createdAt: "2026-03-24T00:00:00.000Z",
            label: "right",
            limit: 1,
            messageCount: 1,
            sessionCount: 1,
            sessions: ["session-b"],
            roleCounts: { assistant: 1 },
          },
          reportPath: "/tmp/report.md",
          summaryPath: "/tmp/summary.json",
          messageDelta: 0,
          sessionDelta: 0,
          roleDelta: {},
          findings: [],
          recommendation: "Keep the current trajectory.",
        }),
      },
    });

    expect(plugin.name).toBe("trajectory-logger");
    expect(plugin.services).toHaveLength(1);
  });

  it("forwards trajectory service calls", async () => {
    const exports = {
      dataPath: "/tmp/trajectory.jsonl",
      manifestPath: "/tmp/trajectory-manifest.json",
      summaryPath: "/tmp/trajectory-summary.json",
    };
    const listBundles = [
      {
        manifestPath: "/tmp/manifest.jsonl",
        dataPath: "/tmp/data.jsonl",
        summaryPath: "/tmp/summary.json",
        createdAt: "2026-04-01T00:00:00.000Z",
        label: "latest",
        limit: 1,
        messageCount: 2,
        sessionCount: 1,
        sessions: ["s1"],
        roleCounts: { user: 1, assistant: 1 },
      },
    ];
    const compareLatest = {
      left: {
        manifestPath: "/tmp/left-manifest.json",
        dataPath: "/tmp/left.jsonl",
        summaryPath: "/tmp/left-summary.json",
        createdAt: "2026-03-24T00:00:00.000Z",
        label: "left",
        limit: 1,
        messageCount: 1,
        sessionCount: 1,
        sessions: ["session-a"],
        roleCounts: { user: 1 },
      },
      right: {
        manifestPath: "/tmp/right-manifest.json",
        dataPath: "/tmp/right.jsonl",
        summaryPath: "/tmp/right-summary.json",
        createdAt: "2026-03-24T00:00:00.000Z",
        label: "right",
        limit: 1,
        messageCount: 1,
        sessionCount: 1,
        sessions: ["session-b"],
        roleCounts: { assistant: 1 },
      },
      leftReplay: {
        manifestPath: "/tmp/left-manifest.json",
        dataPath: "/tmp/left.jsonl",
        summaryPath: "/tmp/left-summary.json",
        replayPath: "/tmp/left-replay.jsonl",
        replaySummaryPath: "/tmp/left-replay-summary.json",
        replayCount: 1,
        replayPreview: [],
        createdAt: "2026-03-24T00:00:00.000Z",
        label: "left",
        limit: 1,
        messageCount: 1,
        sessionCount: 1,
        sessions: ["session-a"],
        roleCounts: { user: 1 },
      },
      rightReplay: {
        manifestPath: "/tmp/right-manifest.json",
        dataPath: "/tmp/right.jsonl",
        summaryPath: "/tmp/right-summary.json",
        replayPath: "/tmp/right-replay.jsonl",
        replaySummaryPath: "/tmp/right-replay-summary.json",
        replayCount: 1,
        replayPreview: [],
        createdAt: "2026-03-24T00:00:00.000Z",
        label: "right",
        limit: 1,
        messageCount: 1,
        sessionCount: 1,
        sessions: ["session-b"],
        roleCounts: { assistant: 1 },
      },
      reportPath: "/tmp/report.md",
      summaryPath: "/tmp/summary.json",
      messageDelta: 0,
      sessionDelta: 0,
      roleDelta: {},
      findings: [],
      recommendation: "Keep the current trajectory.",
    };

    const plugin = createTrajectoryLoggerPlugin({
      trajectories: {
        exportLatest: () => exports,
        listBundles: () => listBundles,
        compareLatest: () => compareLatest,
      },
    });

    const service = (await plugin.services?.[0].start({} as never)) as
      | TrajectoryLoggerTestService
      | undefined;
    expect(service?.exportLatest()).toEqual(exports);
    expect(service?.bundles()).toEqual(listBundles);
    expect(service?.compareLatest()).toEqual(compareLatest);
    expect(await service?.stop()).toBeUndefined();
  });
});
