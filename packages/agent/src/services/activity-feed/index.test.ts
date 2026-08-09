import { describe, expect, it } from "vitest";
import type {
  AutomationRunRecord,
  DelegationTaskRecord,
  DeliveredMessageRecord,
} from "@/types";
import type { AutocoderPipelineRunRecord } from "../autocoder-pipeline";
import type { ExecutionApprovalRecord } from "../execution-approval/types";
import type { RunSnapshot } from "../run-controller/types";
import {
  ACTIVITY_EXPORT_MAX_BYTES,
  type ActivityFeedServices,
  buildActivityExport,
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
    terminal: {
      recent: () => [],
    },
    logger: {
      list: () => [],
    },
    autocoderPipeline: {
      list: () => [],
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
    expect(result.events[1]?.sourceId).toBe("delivery-199");
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

  it("bounds every source before normalization, retaining the newest approval projection", () => {
    const approvals: ExecutionApprovalRecord[] = Array.from(
      { length: 205 },
      (_, index) => ({
        id: `approval-${index}`,
        platform: "api" as const,
        userId: "user",
        roomId: "room",
        command: `SECRET_COMMAND_${index}`,
        reason: `SECRET_REASON_${index}`,
        status: "pending" as const,
        createdAt: new Date(Date.UTC(2026, 6, 28, 0, index)).toISOString(),
        expiresAt: "2026-07-29T00:00:00.000Z",
      }),
    ).reverse();
    const result = buildActivityFeed(
      services({ executionApprovals: { list: () => approvals } }),
      { limit: 200, filters: { kind: "approval" } },
    );

    expect(result.events).toHaveLength(200);
    expect(result.events[0]?.sourceId).toBe("approval-204");
    expect(result.events.at(-1)?.sourceId).toBe("approval-5");
    expect(JSON.stringify(result)).not.toContain("SECRET_COMMAND_");
    expect(JSON.stringify(result)).not.toContain("SECRET_REASON_");
  });

  it("filters by typed operator associations without widening the DTO", () => {
    const approval: ExecutionApprovalRecord = {
      id: "approval-1",
      platform: "api",
      userId: "user-1",
      roomId: "room-1",
      sessionKey: "session-1",
      command: "private command",
      reason: "private reason",
      status: "pending",
      createdAt: "2026-07-28T13:00:00.000Z",
      expiresAt: "2026-07-28T13:30:00.000Z",
    };
    const result = buildActivityFeed(
      services({ executionApprovals: { list: () => [approval] } }),
      {
        filters: {
          target: "review",
          sessionId: "session-1",
          status: "pending",
        },
      },
    );

    expect(result.events).toEqual([
      expect.objectContaining({
        kind: "approval",
        target: "review",
        sessionId: "session-1",
        status: "pending",
      }),
    ]);
  });

  it("projects terminal, repository, code generation, and logs without content leakage", () => {
    const generation: AutocoderPipelineRunRecord = {
      id: "generation-1",
      workflowId: "workflow-1",
      createdAt: "2026-07-28T15:00:00.000Z",
      updatedAt: "2026-07-28T15:01:00.000Z",
      startedAt: "2026-07-28T15:00:00.000Z",
      completedAt: "2026-07-28T15:01:00.000Z",
      phase: "generate",
      kind: "generate",
      projectName: "SECRET_PROJECT",
      sessionId: "session-1",
      status: "completed",
      input: { prompt: "SECRET_GENERATION_PROMPT" },
      outputPreview: "SECRET_GENERATION_OUTPUT",
      artifactPaths: ["/private/SECRET_ARTIFACT.ts"],
    };
    const result = buildActivityFeed(
      services({
        terminal: {
          recent: () => [
            {
              id: "terminal-1",
              command: "SECRET_TERMINAL_COMMAND",
              backend: "local",
              cwd: "/private/SECRET_CWD",
              exitCode: 0,
              stdout: "SECRET_TERMINAL_OUTPUT",
              stderr: "SECRET_TERMINAL_ERROR",
              startedAt: "2026-07-28T16:00:00.000Z",
              completedAt: "2026-07-28T16:01:00.000Z",
            },
          ],
        },
        autocoderPipeline: { list: () => [generation] },
        logger: {
          list: () => [
            {
              at: "2026-07-28T17:00:00.000Z",
              level: "error",
              scope: "SECRET_LOG_SCOPE",
              message: "SECRET_LOG_MESSAGE",
              detail: "SECRET_LOG_DETAIL",
              fields: { token: "SECRET_LOG_TOKEN" },
            },
          ],
        },
      }),
      { limit: 200 },
      {
        repositoryChanges: [
          {
            path: "private/SECRET_PATH.ts",
            previousPath: "private/SECRET_PREVIOUS_PATH.ts",
            indexStatus: "R",
            worktreeStatus: " ",
            staged: true,
            unstaged: false,
            untracked: false,
          },
        ],
        repositoryObservedAt: "2026-07-28T18:00:00.000Z",
      },
    );

    expect(result.events.map((event) => event.kind)).toEqual([
      "repository-change",
      "log",
      "terminal",
      "codegen",
      "chat-run",
    ]);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "terminal",
          status: "succeeded",
          target: "terminal",
        }),
        expect.objectContaining({
          kind: "repository-change",
          status: "recorded",
          target: "workspace",
        }),
        expect.objectContaining({
          kind: "codegen",
          status: "succeeded",
          target: "codegen",
        }),
        expect.objectContaining({
          kind: "log",
          status: "failed",
          target: "operations",
        }),
      ]),
    );
    const serialized = JSON.stringify(result);
    for (const secret of [
      "SECRET_TERMINAL_COMMAND",
      "SECRET_CWD",
      "SECRET_TERMINAL_OUTPUT",
      "SECRET_TERMINAL_ERROR",
      "SECRET_PROJECT",
      "SECRET_GENERATION_PROMPT",
      "SECRET_GENERATION_OUTPUT",
      "SECRET_ARTIFACT",
      "SECRET_LOG_SCOPE",
      "SECRET_LOG_MESSAGE",
      "SECRET_LOG_DETAIL",
      "SECRET_LOG_TOKEN",
      "SECRET_PATH",
      "SECRET_PREVIOUS_PATH",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    const exported = buildActivityExport(result, "2026-07-28T19:00:00.000Z");
    expect(JSON.stringify(exported)).not.toContain("SECRET_");
  });

  it("exports a bounded redacted timeline without internal associations", () => {
    const deliveryIds = Array.from(
      { length: 200 },
      (_, index) => `delivery-${index}`,
    );
    const deliveries = deliveryIds.map((id, index) => ({
      id,
      target: { platform: "api" as const, mode: "local" as const },
      text: `SECRET_DELIVERY_${index}`,
      createdAt: new Date(Date.UTC(2026, 6, 28, 0, index)).toISOString(),
    }));
    const feed = buildActivityFeed(
      services({ delivery: { recent: () => deliveries } }),
      { limit: 200 },
    );
    const exported = buildActivityExport(feed, "2026-07-28T15:00:00.000Z");
    const serialized = JSON.stringify(exported);

    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(
      ACTIVITY_EXPORT_MAX_BYTES,
    );
    expect(exported.byteLength).toBeLessThanOrEqual(ACTIVITY_EXPORT_MAX_BYTES);
    expect(exported.byteLength).toBe(Buffer.byteLength(serialized, "utf8"));
    expect(exported.truncated).toBe(true);
    expect(exported.events[0]).not.toHaveProperty("id");
    expect(serialized).not.toContain("sourceId");
    expect(serialized).not.toContain("sessionId");
    for (const identifier of ["run-1", "session-1", ...deliveryIds]) {
      expect(serialized).not.toContain(identifier);
    }
    expect(serialized).not.toContain("SECRET_DELIVERY_");
  });

  it("does not export source, task, run, session, approval, or delivery identifiers", () => {
    const automation: AutomationRunRecord = {
      id: "automation-identifier",
      jobId: "automation-job-identifier",
      jobName: "private",
      output: "private",
      status: "completed",
      createdAt: "2026-07-28T11:00:00.000Z",
    };
    const delegation: DelegationTaskRecord = {
      id: "task-identifier",
      title: "private",
      objective: "private",
      status: "completed",
      executionMode: "delegated",
      notes: [],
      createdAt: "2026-07-28T12:00:00.000Z",
      updatedAt: "2026-07-28T12:05:00.000Z",
    };
    const approval: ExecutionApprovalRecord = {
      id: "approval-identifier",
      platform: "api",
      userId: "user-identifier",
      roomId: "room-identifier",
      sessionKey: "session-identifier",
      command: "private",
      reason: "private",
      status: "approved",
      createdAt: "2026-07-28T13:00:00.000Z",
      approvedAt: "2026-07-28T13:05:00.000Z",
      expiresAt: "2026-07-28T13:30:00.000Z",
    };
    const delivery: DeliveredMessageRecord = {
      id: "delivery-identifier",
      target: {
        platform: "api",
        mode: "local",
        channelId: "channel-identifier",
      },
      text: "private",
      createdAt: "2026-07-28T14:00:00.000Z",
    };

    const feed = buildActivityFeed(
      services({
        executionApprovals: { list: () => [approval] },
        delivery: { recent: () => [delivery] },
      }),
      {},
      { automationRuns: [automation], delegationTasks: [delegation] },
    );
    const serialized = JSON.stringify(
      buildActivityExport(feed, "2026-07-28T15:00:00.000Z"),
    );

    for (const identifier of [
      "run-1",
      "session-1",
      "room-1",
      "automation-identifier",
      "automation-job-identifier",
      "task-identifier",
      "approval-identifier",
      "user-identifier",
      "room-identifier",
      "session-identifier",
      "delivery-identifier",
      "channel-identifier",
    ]) {
      expect(serialized).not.toContain(identifier);
    }
  });
});
