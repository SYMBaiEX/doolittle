import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { streamSse } from "../../packages/agent/src/server/responses";
import { handleChatRunEventsRoute } from "../../packages/agent/src/server/routes/conversation/chat";
import { RunControllerStore } from "../../packages/agent/src/services/run-controller/store";
import { RunControllerService } from "../../packages/agent/src/services/run-controller-service/index";

it("waits for a reader and releases a blocked producer on cancel", async () => {
  const frames: number[] = [];
  let finishProducer!: () => void;
  const producerFinished = new Promise<void>((resolve) => {
    finishProducer = resolve;
  });
  const onCancel = vi.fn();
  const response = streamSse(
    async (emit) => {
      for (const id of [1, 2, 3]) {
        await emit("progress", { id });
        frames.push(id);
      }
      finishProducer();
    },
    { onCancel },
  );

  await setImmediate();
  expect(frames).toEqual([1]);
  const reader = response.body?.getReader();
  expect(reader).toBeDefined();
  await reader?.read();
  await setImmediate();
  expect(frames).toEqual([1, 2]);
  await reader?.cancel();
  await producerFinished;
  expect(onCancel).toHaveBeenCalledOnce();
});

it("replays recent events and wakes only for the requested run", async () => {
  const runController = new RunControllerService();
  const context = { services: { runController } } as AppContext;
  runController.appendTaskEvent("mine", "response.created", {});
  runController.appendTaskEvent("mine", "response.output_text.delta", {
    delta: "hello",
  });
  const response = handleChatRunEventsRoute(
    context,
    new Request("http://localhost/chat/runs/mine/events?after=1"),
    "mine",
  );
  const text = response.text();
  runController.appendTaskEvent("other", "response.output_text.delta", {
    delta: "other",
  });
  runController.appendTaskEvent(
    "mine",
    "response.completed",
    { response: "hello" },
    true,
  );
  await expect(text).resolves.toBe(
    'event: response.output_text.delta\ndata: {"delta":"hello","event_id":2}\n\n' +
      'event: response.completed\ndata: {"response":"hello","event_id":3}\n\n',
  );
});

it("reports an expired cursor and delivers the terminal event after journal eviction", async () => {
  const runs = new RunControllerService();
  runs.appendTaskEvent("mine", "response.created", {});
  const progress = runs.appendTaskEvent("mine", "agent.progress", {
    detail: "x".repeat(512 * 1024),
  });
  expect(runs.getTaskEvents("mine")).toEqual([]);
  expect(runs.hasTaskJournal("mine")).toBe(true);
  const terminal = runs.appendTaskEvent("mine", "response.completed", {}, true);
  expect(terminal.id).toBe(progress.id + 1);
  expect(runs.getTaskEvents("mine", progress.id)).toEqual([terminal]);
  expect(runs.getTaskEvents("mine", terminal.id)).toEqual([]);
  expect(runs.appendTaskEvent("mine", "late", {})).toEqual(terminal);
  const response = handleChatRunEventsRoute(
    { services: { runController: runs } } as AppContext,
    new Request("http://localhost/chat/runs/mine/events"),
    "mine",
  );
  await expect(response.text()).resolves.toBe(
    'event: response.notice\ndata: {"code":"replay_gap","message":"Some earlier response updates expired."}\n\n' +
      'event: response.completed\ndata: {"event_id":3}\n\n',
  );
});

it("persists private event snapshots and resumes from the cursor after restart", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-stream-journal-"));
  try {
    const runs = new RunControllerService(dataDir);
    const data = { delta: "original" };
    const delta = runs.appendTaskEvent(
      "mine",
      "response.output_text.delta",
      data,
    );
    data.delta = "changed";
    (delta.data as typeof data).delta = "also changed";
    runs.appendTaskEvent("mine", "response.completed", { ok: true }, true);
    runs.dispose();

    const restored = new RunControllerService(dataDir);
    const terminal = restored.getTerminalTaskEvent("mine");
    expect(restored.getTaskEvents("mine")).toEqual([
      { ...delta, data: { delta: "original" } },
      terminal,
    ]);
    expect(restored.getTaskEvents("mine", delta.id)).toEqual([terminal]);
    expect(terminal).toMatchObject({ type: "response.completed", id: 2 });
    restored.dispose();
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("preserves event order when replaying an out-of-order persisted journal", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-stream-legacy-"));
  try {
    const events = [3, 2, 1].map((id) => ({
      id,
      runId: "mine",
      type: id === 1 ? "response.completed" : "agent.progress",
      data: {},
      createdAt: "2026-11-20T00:00:00.000Z",
      terminal: id === 1,
    }));
    await writeFile(
      join(dataDir, "run-receipts.json"),
      JSON.stringify({ version: 2, receipts: [], events: { mine: events } }),
    );
    const restored = new RunControllerService(dataDir);
    expect(restored.getTaskEvents("mine", 1)).toEqual(events.slice(0, 2));
    expect(restored.getTerminalTaskEvent("mine")).toEqual(events[2]);
    restored.dispose();
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("publishes all interrupted receipts and orphaned journals in one recovery write", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-stream-recovery-"));
  try {
    const runs = new RunControllerService(dataDir);
    for (const runId of ["first", "second"]) {
      runs.startTurn({
        sessionId: runId,
        runId,
        roomId: runId,
        source: "desktop",
        message: "Continue this task",
        runDepth: "standard",
        configuredMaxIterations: 45,
        progressMode: "verbose",
      });
    }
    runs.appendTaskEvent("orphan", "response.created", { room_id: "orphan" });
    runs.dispose();

    const publish = vi.fn();
    const recovered = new RunControllerStore(dataDir, { writer: publish });
    expect(publish).toHaveBeenCalledExactlyOnceWith(
      join(dataDir, "run-receipts.json"),
      expect.objectContaining({
        receipts: ["first", "second"].map((runId) =>
          expect.objectContaining({ runId, status: "error" }),
        ),
        events: {
          first: [
            expect.objectContaining({
              type: "response.failed",
              terminal: true,
            }),
          ],
          second: [
            expect.objectContaining({
              type: "response.failed",
              terminal: true,
            }),
          ],
          orphan: [
            expect.objectContaining({ type: "response.created" }),
            expect.objectContaining({
              id: 2,
              type: "response.failed",
              terminal: true,
              data: expect.objectContaining({
                room_id: "orphan",
                code: "runtime_restarted",
              }),
            }),
          ],
        },
      }),
    );
    recovered.dispose();
    expect(publish).toHaveBeenCalledOnce();
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
