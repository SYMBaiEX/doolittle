import { describe, expect, it } from "vitest";
import type {
  AutomationRunRecord,
  DelegationTaskRecord,
  DeliveredMessageRecord,
} from "@/types";
import type { ExecutionApprovalRecord } from "../execution-approval/types";
import type { RunSnapshot } from "../run-controller/types";
import {
  type ActivityFeedServices,
  buildActivityFeed,
  decodeActivityCursor,
} from ".";

const baseRun: RunSnapshot = {
  runId: "run-1",
  sessionId: "session-1",
  roomId: "room-1",
  source: "desktop",
  message: "SECRET_CHAT_PROMPT",
  runDepth: "standard",
  configuredMaxIterations: 10,
  observedActionCount: 2,
  progressMode: "new",
  status: "complete",
  localMutations: [],
  pendingApprovals: 0,
  startedAt: "2026-07-28T10:00:00.000Z",
  updatedAt: "2026-07-28T10:05:00.000Z",
  endedAt: "2026-07-28T10:05:00.000Z",
};

function services(
  overrides: Partial<ActivityFeedServices> = {},
): ActivityFeedServices {
  return {
    runController: {
      listReceipts: () => [baseRun],
    },
    executionApprovals: {
      list: () => [],
    },
    delivery: {
      recent: () => [],
    },
    ...overrides,
  };
}

describe("activity feed", () => {
  it("normalizes authoritative records without exposing content", () => {
    const automation: AutomationRunRecord = {
      id: "automation-1",
      jobId: "job-1",
      jobName: "SECRET_JOB_NAME",
      output: "SECRET_AUTOMATION_OUTPUT",
      status: "failed",
      createdAt: "2026-07-28T11:00:00.000Z",
    };
    const delegation: DelegationTaskRecord = {
      id: "task-1",
      title: "SECRET_TASK_TITLE",
      objective: "SECRET_TASK_OBJECTIVE",
      status: "running",
      executionMode: "delegated",
      attempts: 2,
      notes: ["SECRET_TASK_NOTE"],
      createdAt: "2026-07-28T12:00:00.000Z",
      updatedAt: "2026-07-28T12:05:00.000Z",
    };
    const approval: ExecutionApprovalRecord = {
      id: "approval-1",
      platform: "api",
      userId: "user-1",
      roomId: "room-1",
      sessionKey: "session-1",
      command: "SECRET_COMMAND",
      reason: "SECRET_APPROVAL_REASON",
      status: "pending",
      createdAt: "2026-07-28T13:00:00.000Z",
      expiresAt: "2026-07-28T13:30:00.000Z",
    };
    const delivery: DeliveredMessageRecord = {
      id: "delivery-1",
      target: { platform: "api", mode: "local", channelId: "room-1" },
      text: "SECRET_DELIVERY_TEXT",
      metadata: { token: "SECRET_DELIVERY_METADATA" },
      createdAt: "2026-07-28T14:00:00.000Z",
    };

    const result = buildActivityFeed(
      services({
        executionApprovals: { list: () => [approval] },
        delivery: { recent: () => [delivery] },
      }),
      {},
      { automationRuns: [automation], delegationTasks: [delegation] },
    );

    expect(result.events.map((event) => event.kind)).toEqual([
      "delivery",
      "approval",
      "delegation",
      "automation",
      "chat-run",
    ]);
    expect(result.events[1]).toMatchObject({
      sessionId: "session-1",
      status: "pending",
      target: "review",
      title: "Approval requested",
    });
    const serialized = JSON.stringify(result);
    for (const secret of [
      "SECRET_CHAT_PROMPT",
      "SECRET_JOB_NAME",
      "SECRET_AUTOMATION_OUTPUT",
      "SECRET_TASK_TITLE",
      "SECRET_TASK_OBJECTIVE",
      "SECRET_TASK_NOTE",
      "SECRET_COMMAND",
      "SECRET_APPROVAL_REASON",
      "SECRET_DELIVERY_TEXT",
      "SECRET_DELIVERY_METADATA",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("deduplicates, orders, paginates, and caps events", () => {
    const deliveries = Array.from({ length: 205 }, (_, index) => ({
      id: `delivery-${String(index).padStart(3, "0")}`,
      target: { platform: "api" as const, mode: "local" as const },
      text: `private-${index}`,
      createdAt: new Date(Date.UTC(2026, 6, 28, 0, index)).toISOString(),
    }));
    const result = buildActivityFeed(
      services({
        runController: {
          listReceipts: () => [baseRun, baseRun],
        },
        delivery: { recent: () => deliveries },
      }),
      { limit: 200 },
    );

    expect(result.events).toHaveLength(200);
    expect(result.events[0]?.sourceId).toBe("run-1");
    expect(result.events[1]?.sourceId).toBe("delivery-204");
    expect(new Set(result.events.map((event) => event.id)).size).toBe(200);
    expect(result.cursor && decodeActivityCursor(result.cursor)).toEqual({
      occurredAt: result.events.at(-1)?.occurredAt,
      id: result.events.at(-1)?.id,
    });

    const firstPage = buildActivityFeed(
      services({ delivery: { recent: () => deliveries.slice(0, 4) } }),
      { limit: 2 },
    );
    const secondPage = buildActivityFeed(
      services({ delivery: { recent: () => deliveries.slice(0, 4) } }),
      { limit: 2, after: firstPage.cursor ?? undefined },
    );
    expect(secondPage.events).toHaveLength(2);
    expect(
      (secondPage.events[0]?.occurredAt ?? "").localeCompare(
        firstPage.events.at(-1)?.occurredAt ?? "",
      ),
    ).toBeLessThan(0);
    expect(secondPage.updatedAt).toBe(firstPage.updatedAt);
  });
});
