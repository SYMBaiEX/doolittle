import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExecutionApprovalService } from "@/services/execution-approval/service";
import type { AgentExecutionContext } from "../chat";
import {
  formatShellCommandResponse,
  getExecutionApprovalReason,
  maybeRequireRemoteExecutionApproval,
  runShellCommandForTurn,
} from "./command-execution";

describe("command execution helpers", () => {
  it("formats shell command output consistently", () => {
    const response = formatShellCommandResponse({
      command: "echo hello",
      exitCode: 0,
      stdout: "hello\n",
      stderr: "",
      durationMs: 12,
    });

    expect(response).toContain("Command: echo hello");
    expect(response).toContain("Exit: 0");
    expect(response).toContain("STDOUT:\nhello");
  });

  it("flags dangerous remote commands but allows safe reads", () => {
    expect(getExecutionApprovalReason("git status")).toBeUndefined();
    expect(getExecutionApprovalReason("git push origin main")).toBe(
      "can rewrite git state or publish changes",
    );
  });

  it("creates a remote approval prompt and reuses pending approvals", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-command-exec-"));
    const executionApprovals = new ExecutionApprovalService(root);
    const notices: string[] = [];

    try {
      const context = {
        runtime: {
          character: {
            name: "Doolittle Test",
          },
        },
        services: {
          executionApprovals,
        },
      } as AgentExecutionContext;

      const input = {
        message: "!git push origin main",
        userId: "user-1",
        roomId: "telegram:room-1:user-1:root",
        source: "telegram",
      };

      const prompt = await maybeRequireRemoteExecutionApproval(
        input,
        context,
        "git push origin main",
        {
          onResponseProgress: async ({ response }) => {
            notices.push(response);
          },
        },
      );
      const reused = await maybeRequireRemoteExecutionApproval(
        input,
        context,
        "git push origin main",
      );

      expect(prompt).toContain("Remote execution approval required");
      expect(reused).toContain("Approve and run");
      expect(notices).toHaveLength(1);
      expect(executionApprovals.list("pending")).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("streams local shell execution through the terminal service", async () => {
    const updates: string[] = [];
    const context = {
      runtime: {},
      services: {
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
            handlers?.onStderr?.("warn\n");
            return {
              command,
              exitCode: 0,
              stdout: "hello\n",
              stderr: "warn\n",
              durationMs: 5,
            };
          },
        },
      },
    } as AgentExecutionContext;

    const result = await runShellCommandForTurn("echo hello", context, {
      onResponseProgress: async ({ response }) => {
        updates.push(response);
      },
    });

    expect(result.exitCode).toBe(0);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.at(-1)).toContain("STDOUT:\nhello");
  });
});
