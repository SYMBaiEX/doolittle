import { expect, it, vi } from "vitest";
import { createWorkerHostBridge } from "../../apps/desktop/src/main/bot-process/host-bridge";
import type { BotProcessRegistry } from "../../apps/desktop/src/main/bot-process-registry";
import { DesktopExecutionAdmission } from "../../apps/desktop/src/main/execution-admission";
import { followChatEventStream } from "../../apps/desktop/src/main/ipc/chat-event-stream";

it("cannot admit ACP work after its foreground claim receipt is abandoned", async () => {
  const scope = { sessionId: "conversation", workspacePath: "/workspace" };
  const registry = {
    resolveVerifiedConversationWorkspace: async () => scope,
    bindRun: vi.fn(),
    assertRunOwner: vi.fn(),
    catalog: { stableDefaultBotId: () => "lead" },
    conversations: {
      getRun: () => ({ ...scope, botId: "lead" }),
    },
  } as unknown as BotProcessRegistry;
  const admission = new DesktopExecutionAdmission();
  const { workerHostHandler, workerHostOnAbandonedResult } =
    createWorkerHostBridge({
      getRegistry: () => registry,
      botId: "default",
      admission,
    });
  const foreground = {
    operation: "execution.claim",
    payload: { sessionId: "conversation", runId: "parent", kind: "foreground" },
  } as const;
  const signal = new AbortController().signal;
  const decision = await workerHostHandler?.(foreground, signal);
  expect(decision).toMatchObject({ accepted: true });
  workerHostOnAbandonedResult?.(foreground, decision);
  expect(admission.list()).toEqual([]);
  await expect(
    workerHostHandler?.(
      {
        operation: "execution.claim",
        payload: {
          sessionId: "conversation",
          runId: "child",
          parentRunId: "parent",
          kind: "automatic-acp",
        },
      },
      signal,
    ),
  ).rejects.toThrow("matching foreground run");
});

it("resumes a chat stream from its last cursor with one terminal event", async () => {
  const delta = 'event: response.output_text.delta\ndata: {"event_id":1}\n\n';
  const complete = 'event: response.completed\ndata: {"event_id":2}\n\n';
  const fetchRuntime = vi
    .fn()
    .mockResolvedValueOnce(new Response(delta))
    .mockResolvedValueOnce(new Response(delta + complete + complete));
  const onEvent = vi.fn();
  await followChatEventStream({
    runtimeUrl: "http://localhost",
    requestId: "run",
    signal: new AbortController().signal,
    fetchRuntime,
    onEvent,
  });
  expect(fetchRuntime.mock.calls.map(([url]) => url)).toEqual([
    "http://localhost/chat/runs/run/events?after=0",
    "http://localhost/chat/runs/run/events?after=1",
  ]);
  expect(onEvent.mock.calls.map(([, id, terminal]) => [id, terminal])).toEqual([
    [1, false],
    [2, true],
  ]);
});
