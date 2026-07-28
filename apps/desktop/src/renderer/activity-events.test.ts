import { describe, expect, it } from "vitest";
import {
  type ActivityEvent,
  activityTone,
  buildActivityEvents,
  coalesceActivityEvents,
} from "./activity-events";

describe("activity event semantics", () => {
  it("turns terminal history into a verb, object, and outcome", () => {
    const [event] = buildActivityEvents({
      terminal: [
        {
          id: "command-1",
          command: "bun test",
          backend: "local",
          cwd: "/workspace",
          durationMs: 1_240,
          exitCode: 0,
          stdout: "12 pass",
          startedAt: "2026-07-27T12:00:00.000Z",
          completedAt: "2026-07-27T12:00:01.240Z",
        },
      ],
    });

    expect(event).toMatchObject({
      verb: "Ran",
      object: "bun test",
      outcome: "Exited cleanly in 1.2 s.",
      status: "Completed",
      severity: "info",
      liveness: "settled",
      source: "Terminal",
    });
    expect(event?.context).toContain("Working directory: /workspace");
    expect(event?.context).toContain("Output: 12 pass");
  });

  it("marks pending approvals live and failed commands critical", () => {
    const events = buildActivityEvents({
      approvals: [
        {
          id: "approval-1",
          status: "pending",
          command: "git push",
          reason: "Changes remote state",
          createdAt: "2026-07-27T13:00:00.000Z",
        },
      ],
      terminal: [
        {
          id: "command-2",
          command: "bun run build",
          exitCode: 1,
          stderr: "compile failed",
          startedAt: "2026-07-27T12:00:00.000Z",
          completedAt: "2026-07-27T12:00:03.000Z",
        },
      ],
    });

    expect(events[0]).toMatchObject({
      verb: "Needs approval for",
      liveness: "live",
      severity: "warning",
    });
    expect(activityTone(events[0] as ActivityEvent)).toBe("warn");
    expect(events[1]).toMatchObject({
      verb: "Command failed",
      outcome: "Exited with code 1.",
      severity: "critical",
      liveness: "settled",
    });
    expect(activityTone(events[1] as ActivityEvent)).toBe("bad");
  });

  it("describes current repository changes without inventing timestamps", () => {
    const [event] = buildActivityEvents({
      changes: [
        {
          path: "src/activity.ts",
          staged: true,
          indexStatus: "M",
        },
      ],
    });

    expect(event).toMatchObject({
      verb: "Staged",
      object: "src/activity.ts",
      outcome: "Ready for the next commit.",
      liveness: "snapshot",
      lifecycle: "Current workspace state",
      at: "",
    });
  });

  it("coalesces correlated lifecycle logs and keeps the conclusive outcome", () => {
    const events = buildActivityEvents({
      logs: [
        {
          at: "2026-07-27T12:00:00.000Z",
          level: "info",
          scope: "agent",
          message: "Started analysis",
          fields: { runId: "run-9", status: "running" },
        },
        {
          at: "2026-07-27T12:00:04.000Z",
          level: "info",
          scope: "agent",
          message: "Analysis complete",
          fields: { runId: "run-9", status: "completed" },
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      outcome: "Analysis complete",
      status: "Completed",
      liveness: "settled",
      relatedCount: 2,
      at: "2026-07-27T12:00:04.000Z",
    });
    expect(events[0]?.raw).toContain("records");
  });

  it("keeps critical outcomes when a newer correlated progress record arrives", () => {
    const base: ActivityEvent = {
      id: "failure",
      kind: "log",
      at: "2026-07-27T12:00:00.000Z",
      atMs: 1,
      source: "Runtime",
      verb: "Reported failure in",
      object: "agent",
      outcome: "Failed",
      status: "Failed",
      severity: "critical",
      liveness: "settled",
      context: "",
      lifecycle: "",
      raw: "{}",
      relatedCount: 1,
      correlationKey: "log:shared",
    };
    const [event] = coalesceActivityEvents([
      base,
      {
        ...base,
        id: "progress",
        at: "2026-07-27T12:00:01.000Z",
        atMs: 2,
        verb: "Working on",
        outcome: "Retrying",
        status: "Running",
        severity: "info",
        liveness: "live",
      },
    ]);

    expect(event).toMatchObject({
      outcome: "Failed",
      severity: "critical",
      at: "2026-07-27T12:00:01.000Z",
      relatedCount: 2,
    });
  });

  it("bounds raw payloads and visible copy", () => {
    const [event] = buildActivityEvents({
      deliveries: [
        {
          id: "delivery-1",
          target: { platform: "discord" },
          text: "x".repeat(5_000),
          createdAt: "2026-07-27T12:00:00.000Z",
        },
      ],
    });

    expect(event?.context.length).toBeLessThanOrEqual(321);
    expect(event?.raw.length).toBeLessThanOrEqual(2_401);
    expect(event?.raw.endsWith("…")).toBe(true);
  });
});
