import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunUpdateEvent } from "@doolittle/contracts/run";
import { EventType } from "@elizaos/core";
import { expect, it } from "vitest";
import { nativeToolActivityProjector } from "../../packages/agent/src/runtime/bootstrap/runtime/native-tool-activity";
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

const serviceGraphs = new WeakMap<RunControllerService, AppServices>();

function servicesFor(runController: RunControllerService): AppServices {
  let services = serviceGraphs.get(runController);
  if (!services) {
    services = {
      runController,
      settings: { get: () => ({ model: {} }) },
      workspace: { root: () => "/approved" },
    } as AppServices;
    serviceGraphs.set(runController, services);
  }
  return services;
}

function bridge(runController: RunControllerService) {
  return createRunProgressEvents(servicesFor(runController));
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
  // The collapsed preview still hides arbitrary arguments; the expansion
  // detail keeps the full invocation with secrets masked, not dropped.
  expect(activity.command).not.toMatch(
    /opaque-value|hidden-key|opaque-script/u,
  );
  expect(activity.commandDetail).toBe(
    "cd /approved/opaque-value && nub run test:scope hidden-key.test.ts && nub run opaque-script",
  );
});

it("carries the full masked command and a bounded redacted output tail on shell results", () => {
  const secret = "doolittle-fixture-secret-value";
  process.env.DOOLITTLE_TEST_SECRET_VALUE = secret;
  try {
    const activity = projectActionActivity("TERMINAL_SHELL", {
      success: true,
      data: {
        commandResult: {
          command: `cd /approved/app && echo ${secret}`,
          cwd: "/approved/app",
          exitCode: 2,
          stdout: "ignored stdout",
          stderr: `first line\n${"error detail\n".repeat(400)}\u001b[31m${secret}\u001b[0m\n`,
        },
      },
    });
    expect(activity.phase).toBe("failed");
    // A redaction match collapses the durable preview but only masks the detail.
    expect(activity.command).toBeUndefined();
    expect(activity.commandDetail).toBe(
      "cd /approved/app && echo [REDACTED:DOOLITTLE_TEST_SECRET_VALUE]",
    );
    const output = activity.output ?? "";
    expect(output.length).toBeLessThanOrEqual(4 * 1024);
    expect(output.startsWith("…")).toBe(true);
    expect(output).toContain("[REDACTED:DOOLITTLE_TEST_SECRET_VALUE]");
    expect(output).not.toContain("first line");
    expect(output).not.toContain("ignored stdout");
    expect(output).not.toContain(secret);
    expect(output).not.toContain("\u001b");
  } finally {
    delete process.env.DOOLITTLE_TEST_SECRET_VALUE;
  }
});

it("projects an explicit user-facing failure explanation without diagnostic text", () => {
  const activity = projectActionActivity(
    "TODO",
    {
      success: false,
      text: "TODO failed: diagnostic internals must stay out of the tile",
      error: "TODO_PERSISTENCE_INTERNAL",
      userFacingText:
        "I could not add the todo because storage is unavailable.",
      verifiedUserFacing: true,
    },
    "failed",
  );

  expect(activity).toEqual({
    action: "TODO",
    phase: "failed",
    summary: "I could not add the todo because storage is unavailable.",
  });
});

it("omits failure detail when upstream provides only diagnostic text or errors", () => {
  const activity = projectActionActivity(
    "TODO",
    {
      success: false,
      text: "raw upstream failure with adapter internals",
      error: new Error("raw upstream error with adapter internals"),
    },
    "failed",
  );

  expect(activity).toEqual({ action: "TODO", phase: "failed" });
});

it("redacts secrets and terminal controls from user-facing failure detail", () => {
  const secret = "failure-detail-secret-value";
  process.env.DOOLITTLE_TEST_FAILURE_SECRET = secret;
  try {
    const activity = projectActionActivity(
      "TODO",
      {
        success: false,
        userFacingText: `Could not save ${secret}.\n\u001b[31m\u202eTry again.`,
      },
      "failed",
    );

    expect(activity.summary).toBe(
      "Could not save [REDACTED:DOOLITTLE_TEST_FAILURE_SECRET]. Try again.",
    );
  } finally {
    delete process.env.DOOLITTLE_TEST_FAILURE_SECRET;
  }
});

it("does not project user-facing text contradicted by an internal transcript marker", () => {
  const activity = projectActionActivity(
    "TODO",
    {
      success: false,
      transcriptVisibility: "internal",
      userFacingText: "internal diagnostic despite the contradictory field",
    },
    "failed",
  );

  expect(activity.summary).toBeUndefined();
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
          activity: expect.objectContaining({
            action: "TERMINAL_SHELL",
            phase: "running",
          }),
        }),
      }),
      expect.objectContaining({
        type: "agent.run",
        data: expect.objectContaining({
          type: "action-completed",
          activity: expect.objectContaining({
            action: "TERMINAL_SHELL",
            phase: "completed",
            kind: "execute",
            command: "nub run test:scope",
            commandDetail: "nub run test:scope",
            directory: "/approved/project",
            output: "3 passed · 0 failed",
            exitCode: 0,
            durationMs: 792,
          }),
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
  const secret = "arbitrary-private-string";
  process.env.DOOLITTLE_TEST_COMMAND_SECRET = secret;
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
                  command: `curl --data ${secret}`,
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
      // A redaction match still collapses the durable preview entirely,
      // while the expansion detail keeps the masked invocation.
      command: undefined,
      commandDetail: "curl --data [REDACTED:DOOLITTLE_TEST_COMMAND_SECRET]",
      exitCode: 22,
    });
    expect(JSON.stringify(updates)).not.toContain(secret);
  } finally {
    delete process.env.DOOLITTLE_TEST_COMMAND_SECRET;
    runs.dispose();
  }
});

it("enriches a uniquely correlated native action with its workspace target", async () => {
  const runs = new RunControllerService();
  try {
    startSubmit(runs);
    const updates: RunUpdateEvent[] = [];
    runs.onUpdate((update) => updates.push(update));
    const services = servicesFor(runs);
    const events = bridge(runs);
    for (const handler of events[EventType.ACTION_STARTED] ?? []) {
      await handler({
        roomId: "chat-room",
        content: { actions: ["READ_FILE"] },
      } as never);
    }
    const started = updates[0]?.activity;
    expect(started?.id).toEqual(expect.any(String));
    expect(started).not.toHaveProperty("paths");

    runWithTurnRuntimeScope(
      { getSetting: () => undefined },
      { settings: new Map(), runId: "chat-run" },
      () => {
        nativeToolActivityProjector(services).observeOwnerExecution({
          phase: "started",
          gate: "execution",
          gateOutcome: "executed",
          actionName: "READ_FILE",
          args: { path: "notes.ts", content: "private file contents" },
          redactedFields: 0,
          redactedStrings: 0,
          omittedFields: 0,
        });
      },
    );

    expect(updates[1]).toMatchObject({
      type: "action-progress",
      activity: {
        id: started?.id,
        action: "READ_FILE",
        phase: "running",
        paths: ["notes.ts"],
      },
    });
    expect(JSON.stringify(updates)).not.toContain("private file contents");

    for (const handler of events[EventType.ACTION_COMPLETED] ?? []) {
      await handler({
        roomId: "chat-room",
        runId: "chat-run",
        content: {
          actions: ["READ_FILE"],
          actionStatus: "completed",
          actionResult: { success: true },
        },
      } as never);
    }
    expect(updates[2]?.activity).toMatchObject({
      id: started?.id,
      action: "READ_FILE",
      phase: "completed",
      durationMs: expect.any(Number),
    });

    for (const handler of events[EventType.ACTION_STARTED] ?? []) {
      await handler({
        roomId: "chat-room",
        content: { actions: ["READ_FILE"] },
      } as never);
    }
    runWithTurnRuntimeScope(
      { getSetting: () => undefined },
      { settings: new Map(), runId: "chat-run" },
      () => {
        nativeToolActivityProjector(services).observeOwnerExecution({
          phase: "started",
          gate: "execution",
          gateOutcome: "executed",
          actionName: "READ_FILE",
          args: { path: "../outside-secret.ts" },
          redactedFields: 0,
          redactedStrings: 0,
          omittedFields: 0,
        });
      },
    );
    expect(updates).toHaveLength(4);
    expect(updates[3]?.activity).not.toHaveProperty("paths");
    expect(JSON.stringify(updates)).not.toContain("outside-secret.ts");
  } finally {
    runs.dispose();
  }
});

it("projects only the safe shell command preview from observed input", async () => {
  const runs = new RunControllerService();
  const secret = "native-input-secret-value";
  process.env.DOOLITTLE_TEST_NATIVE_INPUT_SECRET = secret;
  try {
    startSubmit(runs);
    const updates: RunUpdateEvent[] = [];
    runs.onUpdate((update) => updates.push(update));
    const services = servicesFor(runs);
    const events = bridge(runs);
    for (const handler of events[EventType.ACTION_STARTED] ?? []) {
      await handler({
        roomId: "chat-room",
        content: { actions: ["TERMINAL_SHELL"] },
      } as never);
    }
    runWithTurnRuntimeScope(
      { getSetting: () => undefined },
      { settings: new Map(), runId: "chat-run" },
      () => {
        const projector = nativeToolActivityProjector(services);
        projector.observeOwnerExecution({
          phase: "started",
          gate: "execution",
          gateOutcome: "executed",
          actionName: "TERMINAL_SHELL",
          args: { command: "git status" },
          redactedFields: 0,
          redactedStrings: 0,
          omittedFields: 0,
        });
      },
    );
    for (const handler of events[EventType.ACTION_STARTED] ?? []) {
      await handler({
        roomId: "chat-room",
        content: { actions: ["TERMINAL_SHELL"] },
      } as never);
    }
    runWithTurnRuntimeScope(
      { getSetting: () => undefined },
      { settings: new Map(), runId: "chat-run" },
      () => {
        nativeToolActivityProjector(services).observeOwnerExecution({
          phase: "started",
          gate: "execution",
          gateOutcome: "executed",
          actionName: "TERMINAL_SHELL",
          args: { command: `curl --data ${secret}` },
          redactedFields: 0,
          redactedStrings: 0,
          omittedFields: 0,
        });
      },
    );

    expect(updates).toHaveLength(3);
    expect(updates[1]?.activity?.command).toBe("git status");
    expect(updates[2]?.activity).not.toHaveProperty("command");
    expect(JSON.stringify(updates)).not.toContain(secret);
  } finally {
    delete process.env.DOOLITTLE_TEST_NATIVE_INPUT_SECRET;
    runs.dispose();
  }
});

it("does not guess targets when parallel invocations of one action are ambiguous", async () => {
  const runs = new RunControllerService();
  try {
    startSubmit(runs);
    const updates: RunUpdateEvent[] = [];
    runs.onUpdate((update) => updates.push(update));
    const services = servicesFor(runs);
    const events = bridge(runs);
    for (let index = 0; index < 2; index += 1) {
      for (const handler of events[EventType.ACTION_STARTED] ?? []) {
        await handler({
          roomId: "chat-room",
          content: { actions: ["READ_FILE"] },
        } as never);
      }
    }
    runWithTurnRuntimeScope(
      { getSetting: () => undefined },
      { settings: new Map(), runId: "chat-run" },
      () => {
        nativeToolActivityProjector(services).observeOwnerExecution({
          phase: "started",
          gate: "execution",
          gateOutcome: "executed",
          actionName: "READ_FILE",
          args: { path: "notes.ts" },
          redactedFields: 0,
          redactedStrings: 0,
          omittedFields: 0,
        });
      },
    );

    expect(updates).toHaveLength(2);
    expect(JSON.stringify(updates)).not.toContain("notes.ts");
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
