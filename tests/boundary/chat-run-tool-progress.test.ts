import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunUpdateEvent } from "@doolittle/contracts/run";
import { EventType } from "@elizaos/core";
import { expect, it } from "vitest";
import { createRunProgressEvents } from "../../packages/agent/src/runtime/bootstrap/runtime/run-progress";
import { executeManagedDelegation } from "../../packages/agent/src/runtime/native/coding-delegation/execution";
import type { ManagedAcpService } from "../../packages/agent/src/runtime/native/coding-delegation/types";
import { projectActionActivity } from "../../packages/agent/src/runtime/tool-activity";
import { runWithTurnRuntimeScope } from "../../packages/agent/src/runtime/turn-runtime-scope";
import type { AppServices } from "../../packages/agent/src/services/index";
import { RunControllerService } from "../../packages/agent/src/services/run-controller-service";

function startSubmit(
  runController: RunControllerService,
  runId = "chat-run",
): void {
  runController.startTurn({
    sessionId: "chat-session",
    roomId: "chat-room",
    runId,
    source: "desktop",
    message: "Run the checks",
    runDepth: "standard",
    configuredMaxIterations: 15,
    progressMode: "new",
  });
}

function bridge(runController: RunControllerService) {
  const services = {
    runController,
    settings: { get: () => ({ model: {} }) },
  } as AppServices;
  return createRunProgressEvents(services);
}

it("keeps private path and script arguments out of the durable command preview", () => {
  const activity = projectActionActivity("TERMINAL_SHELL", {
    success: true,
    data: {
      commandResult: {
        command:
          "cd /approved/opaque-value && nub run test:scope hidden-key.test.ts && nub run opaque-script",
        cwd: "/approved",
        exitCode: 0,
      },
    },
  });
  expect(activity.command).toBe("nub run test:scope …");
  expect(JSON.stringify(activity)).not.toMatch(
    /opaque-value|hidden-key|opaque-script/u,
  );
});

it("replays the default shell outcome and safe test counts without stdout or stderr", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-tool-journal-"));
  let runs = new RunControllerService(dataDir);
  try {
    startSubmit(runs);
    const detach = runs.onUpdate((update) => {
      runs.appendTaskEvent(update.run.runId, "agent.run", update);
    });
    const events = bridge(runs);
    for (const handler of events[EventType.ACTION_STARTED] ?? []) {
      await handler({
        roomId: "chat-room",
        content: { actions: ["TERMINAL_SHELL"] },
      } as never);
    }
    for (const handler of events[EventType.ACTION_COMPLETED] ?? []) {
      await handler({
        roomId: "chat-room",
        runId: "chat-run",
        content: {
          actions: ["TERMINAL_SHELL"],
          actionStatus: "completed",
          actionResult: {
            success: true,
            data: {
              commandResult: {
                command: "nub run test:scope",
                cwd: "/approved/project",
                exitCode: 0,
                durationMs: 792,
                stdout:
                  "# tests 3\n# pass 3\n# fail 0\nunknown-private-file-value",
                stderr: "unknown-private-stderr-value",
              },
            },
          },
        },
      } as never);
    }
    detach();
    await runs.finishTaskEvent("chat-run", "response.completed", {});
    runs.dispose();
    runs = new RunControllerService(dataDir);

    const replayed = runs.getTaskEvents("chat-run");
    expect(replayed).toEqual([
      expect.objectContaining({
        type: "agent.run",
        data: expect.objectContaining({
          type: "action-started",
          activity: { action: "TERMINAL_SHELL", phase: "running" },
        }),
      }),
      expect.objectContaining({
        type: "agent.run",
        data: expect.objectContaining({
          type: "action-completed",
          activity: {
            action: "TERMINAL_SHELL",
            phase: "completed",
            kind: "execute",
            command: "nub run test:scope",
            directory: "/approved/project",
            output: "3 passed · 0 failed",
            exitCode: 0,
            durationMs: 792,
          },
        }),
      }),
      expect.objectContaining({ type: "response.completed" }),
    ]);
    expect(JSON.stringify(replayed)).not.toContain("unknown-private-");
  } finally {
    runs.dispose();
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("keeps prior runs and secret-bearing arguments out of the current receipt", async () => {
  const runs = new RunControllerService();
  try {
    startSubmit(runs, "old-run");
    runs.finishTurn("chat-session", "cancelled");
    startSubmit(runs, "new-run");
    const updates: RunUpdateEvent[] = [];
    runs.onUpdate((update) => updates.push(update));
    const complete = async () => {
      for (const handler of bridge(runs)[EventType.ACTION_COMPLETED] ?? []) {
        await handler({
          roomId: "chat-room",
          content: {
            actions: ["TERMINAL_SHELL"],
            actionStatus: "completed",
            actionResult: {
              success: true,
              data: {
                commandResult: {
                  command: "curl --data arbitrary-private-string",
                  exitCode: 22,
                },
              },
            },
          },
        } as never);
      }
    };
    const runtime = { getSetting: () => undefined };
    await runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), runId: "old-run" },
      complete,
    );
    expect(updates).toEqual([]);
    await complete();
    expect(updates[0]?.activity).not.toHaveProperty("command");
    await runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), runId: "new-run" },
      complete,
    );
    expect(updates[1]?.activity).toMatchObject({
      phase: "failed",
      command: "curl …",
      exitCode: 22,
    });
    expect(JSON.stringify(updates)).not.toContain("arbitrary-private-string");
  } finally {
    runs.dispose();
  }
});

it("projects only owned delegated tool phases and preserves a stable tool identity", async () => {
  const workdir = await mkdtemp(join(tmpdir(), "doolittle-tool-worker-"));
  const runs = new RunControllerService();
  try {
    startSubmit(runs);
    const updates: RunUpdateEvent[] = [];
    runs.onUpdate((update) => updates.push(update));
    let emit: Parameters<ManagedAcpService["onSessionEvent"]>[0] | undefined;
    const tool = {
      id: "edit-step",
      title: "private-command-from-adapter",
      kind: "edit",
      status: "pending",
      locations: [
        { path: join(workdir, "src/index.ts") },
        { path: "/not-owned/file" },
      ],
      output: "private-file-output",
    };
    const service = {
      async spawnSession() {
        return {
          sessionId: "child",
          workdir,
          agentType: "codex",
          status: "ready",
        };
      },
      async sendPrompt() {
        emit?.("different-child", "tool_running", {
          toolCall: { ...tool, id: "foreign" },
        });
        emit?.("child", "reasoning", { text: "private-model-reasoning" });
        emit?.("child", "tool_running", { toolCall: tool });
        const running = { ...tool, status: "in_progress" };
        emit?.("child", "tool_running", { toolCall: running });
        emit?.("child", "tool_running", { toolCall: running });
        emit?.("child", "tool_running", {
          toolCall: { id: tool.id, status: "completed" },
        });
        return { stopReason: "end_turn", exitCode: 0 };
      },
      async cancelSession() {},
      async stopSession() {},
      onSessionEvent(listener) {
        emit = listener;
        return () => {
          emit = undefined;
        };
      },
    } satisfies ManagedAcpService;
    const { receipt } = await executeManagedDelegation({
      service,
      options: { workdir, initialTask: "Edit src/index.ts" },
      roomId: "chat-room",
      services: { workspace: { root: () => workdir }, runController: runs },
    });
    expect(receipt.status).toBe("completed");
    const workerUpdates = updates.filter(
      (update) => update.activity?.kind === "edit",
    );
    expect(workerUpdates.map(({ activity }) => activity?.phase)).toEqual([
      "queued",
      "running",
      "completed",
    ]);
    expect(
      new Set(workerUpdates.map(({ activity }) => activity?.id)).size,
    ).toBe(1);
    for (const update of workerUpdates) {
      expect(update).toMatchObject({
        type: "action-progress",
        sessionId: "chat-session",
        run: { runId: "chat-run" },
        activity: { origin: "delegated", paths: ["src/index.ts"] },
      });
    }
    expect(JSON.stringify(updates)).not.toMatch(/private-|\/not-owned\//u);
  } finally {
    runs.dispose();
    await rm(workdir, { recursive: true, force: true });
  }
});
