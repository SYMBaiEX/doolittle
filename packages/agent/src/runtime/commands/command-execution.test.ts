import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOOLITTLE_SHELL_SERVICE } from "@doolittle/contracts";
import { describe, expect, it, vi } from "vitest";
import { ExecutionApprovalService } from "@/services/execution-approval/service";
import type { AgentExecutionContext } from "../chat";
import {
  formatShellCommandResponse,
  getExecutionApprovalReason,
  maybeRequireRemoteExecutionApproval,
  resolveRemoteExecutionApprovalPrompt,
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

      const created = await resolveRemoteExecutionApprovalPrompt(
        input,
        context,
        "git push origin main",
      );
      const reused = await resolveRemoteExecutionApprovalPrompt(
        input,
        context,
        "git push origin main",
      );
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

      expect(created).toMatchObject({ created: true });
      expect(reused).toMatchObject({ created: false, id: created?.id });
      expect(prompt).toContain("Remote execution approval required");
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

  it("propagates cancellation through non-local terminal execution", async () => {
    const controller = new AbortController();
    const onResponseProgress = vi.fn();
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const run = vi.fn(
      async (
        command: string,
        _timeoutMs?: number,
        abortSignal?: AbortSignal,
      ) => {
        await new Promise<void>((resolve) => {
          abortSignal?.addEventListener("abort", () => resolve(), {
            once: true,
          });
          markStarted?.();
        });
        return {
          command,
          exitCode: 130,
          stdout: "",
          stderr: "Command cancelled.",
          durationMs: 5,
        };
      },
    );
    const context = {
      runtime: {
        getService: (name: string) =>
          name === DOOLITTLE_SHELL_SERVICE
            ? { run, history: () => [], status: async () => ({}) }
            : null,
      },
      services: {
        settings: {
          get: () => ({ execution: { backend: "docker" } }),
        },
      },
    } as unknown as AgentExecutionContext;

    const turn = runShellCommandForTurn("long-command", context, {
      abortSignal: controller.signal,
      onResponseProgress,
    });
    await started;
    const reason = new DOMException("Turn cancelled", "AbortError");
    controller.abort(reason);

    await expect(turn).rejects.toBe(reason);
    expect(run).toHaveBeenCalledWith(
      "long-command",
      undefined,
      controller.signal,
    );
    expect(onResponseProgress).not.toHaveBeenCalled();
  });

  it("drops buffered local output after terminal cancellation", async () => {
    const controller = new AbortController();
    const onResponseProgress = vi.fn();
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const runStreamingLocal = vi.fn(
      async (
        command: string,
        handlers: {
          onStdout?: (chunk: string) => void;
          onStderr?: (chunk: string) => void;
        },
        _timeoutMs: number | undefined,
        abortSignal: AbortSignal | undefined,
      ) => {
        await new Promise<void>((resolve) => {
          abortSignal?.addEventListener(
            "abort",
            () => {
              handlers.onStdout?.("late stdout\n");
              handlers.onStderr?.("late stderr\n");
              resolve();
            },
            { once: true },
          );
          markStarted?.();
        });
        return {
          command,
          exitCode: 130,
          stdout: "late stdout\n",
          stderr: "late stderr\n",
          durationMs: 5,
        };
      },
    );
    const context = {
      runtime: {},
      services: {
        settings: {
          get: () => ({ execution: { backend: "local" } }),
        },
        terminal: { runStreamingLocal },
      },
    } as unknown as AgentExecutionContext;

    const turn = runShellCommandForTurn("long-command", context, {
      abortSignal: controller.signal,
      onResponseProgress,
    });
    await started;
    const reason = new DOMException("Turn cancelled", "AbortError");
    controller.abort(reason);

    await expect(turn).rejects.toBe(reason);
    expect(runStreamingLocal).toHaveBeenCalledWith(
      "long-command",
      expect.any(Object),
      undefined,
      controller.signal,
    );
    expect(onResponseProgress).not.toHaveBeenCalled();
  });
});
