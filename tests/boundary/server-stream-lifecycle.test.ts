import { setImmediate } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { streamSse } from "../../packages/agent/src/server/responses";
import { handleChatRunEventsRoute } from "../../packages/agent/src/server/routes/conversation/chat";
import { RunControllerService } from "../../packages/agent/src/services/run-controller-service/index";

it("waits for a reader and releases a blocked producer on cancel", async () => {
  const frames: number[] = [];
  const producer = Promise.withResolvers<void>();
  const onCancel = vi.fn();
  const response = streamSse(
    async (emit) => {
      for (const id of [1, 2, 3]) {
        await emit("progress", { id });
        frames.push(id);
      }
      producer.resolve();
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
  await producer.promise;
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
