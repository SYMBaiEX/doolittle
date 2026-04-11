import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExecutionApprovalService } from "@/services/execution-approval/service";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../chat";
import { handleExecutionApprovalCommand } from "./approval-router";

function createInput(
  overrides: Partial<ChatTurnRequest> = {},
): ChatTurnRequest {
  return {
    message: "/approvals",
    userId: "user-1",
    roomId: "telegram:room-1:user-1:root",
    source: "telegram",
    ...overrides,
  };
}

describe("execution approval command router", () => {
  it("lists only approvals scoped to the requester", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-approval-router-"));
    const executionApprovals = new ExecutionApprovalService(root);

    try {
      await executionApprovals.request({
        platform: "telegram",
        userId: "user-1",
        roomId: "telegram:room-1:user-1:root",
        sessionKey: "telegram:room-1:user-1:root",
        command: "git push origin main",
        reason: "can rewrite git state or publish changes",
      });
      await executionApprovals.request({
        platform: "telegram",
        userId: "user-2",
        roomId: "telegram:room-2:user-2:root",
        sessionKey: "telegram:room-2:user-2:root",
        command: "rm -rf /tmp/demo",
        reason: "can delete files",
      });

      const context = {
        runtime: {},
        services: {
          executionApprovals,
        },
      } as AgentExecutionContext;

      const response = await handleExecutionApprovalCommand(
        createInput(),
        "/approvals",
        context,
      );

      expect(response).toContain("git push origin main");
      expect(response).not.toContain("rm -rf /tmp/demo");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("approves and executes a pending command through the alias route", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-approval-router-"));
    const executionApprovals = new ExecutionApprovalService(root);
    const updates: string[] = [];

    try {
      const pending = await executionApprovals.request({
        platform: "telegram",
        userId: "user-1",
        roomId: "telegram:room-1:user-1:root",
        sessionKey: "telegram:room-1:user-1:root",
        command: "echo hello",
        reason: "can run commands remotely",
      });

      const context = {
        runtime: {},
        services: {
          executionApprovals,
          settings: {
            get: () => ({
              execution: {
                backend: "local",
              },
            }),
          },
          terminal: {
            runStreamingLocal: async (
              command: string,
              handlers?: {
                onStdout?: (chunk: string) => void;
                onStderr?: (chunk: string) => void;
              },
            ) => {
              handlers?.onStdout?.("hello\n");
              return {
                command,
                exitCode: 0,
                stdout: "hello\n",
                stderr: "",
                durationMs: 4,
              };
            },
          },
        },
      } as AgentExecutionContext;

      const response = await handleExecutionApprovalCommand(
        createInput(),
        `/approve ${pending.id}`,
        context,
        {
          onResponseProgress: async ({ response }) => {
            updates.push(response);
          },
        },
      );

      expect(response).toContain(`Approval ${pending.id} accepted.`);
      expect(response).toContain("STDOUT:\nhello");
      expect(updates[0]).toContain(`Approval ${pending.id} accepted.`);
      expect(executionApprovals.get(pending.id)?.status).toBe("used");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
