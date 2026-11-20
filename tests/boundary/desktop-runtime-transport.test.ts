import { expect, it, vi } from "vitest";
import { createWorkerHostBridge } from "../../apps/desktop/src/main/bot-process/host-bridge";
import type { BotProcessRegistry } from "../../apps/desktop/src/main/bot-process-registry";
import { createDesktopQuitHandler } from "../../apps/desktop/src/main/desktop-quit";
import { EngineBotBackend } from "../../apps/desktop/src/main/engine-bot-backend";
import type { EngineClient } from "../../apps/desktop/src/main/engine-client";
import { DesktopExecutionAdmission } from "../../apps/desktop/src/main/execution-admission";
import { followChatEventStream } from "../../apps/desktop/src/main/ipc/chat-event-stream";

it("uses the isolate's private token to stop work without granting lead inventory access", async () => {
  const engine = {
    startBot: vi.fn<EngineClient["startBot"]>().mockResolvedValue({
      url: "http://127.0.0.1:9001",
      agentId: "agent",
      botId: "worker",
      name: "Worker",
    }),
    stopBot: vi.fn<EngineClient["stopBot"]>().mockResolvedValue(),
  };
  const fetchRuntime = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json({ stopped: false }));
  const runtime = new EngineBotBackend(
    process.cwd(),
    process.cwd(),
    process.cwd(),
    fetchRuntime,
    {
      expectedBotId: "worker",
      expectedAgentId: "agent",
      workerHostHandler: async () => undefined,
      isolatedEnvironment: {},
    },
    () => engine as unknown as EngineClient,
  );
  const phases: string[] = [];
  const unsubscribe = runtime.subscribe((state) => phases.push(state.phase));

  await expect(runtime.start()).resolves.toMatchObject({ phase: "ready" });
  const token =
    engine.startBot.mock.calls[0][1].DOOLITTLE_DESKTOP_CONTROL_TOKEN;
  expect(token).toMatch(/^[0-9a-f]{64}$/u);
  expect(runtime.operatorInventoryHeaders()).toEqual({});
  await expect(runtime.stopAllOwnedExecutions()).rejects.toThrow(
    "did not confirm execution stop",
  );
  expect(fetchRuntime).toHaveBeenCalledWith(
    "http://127.0.0.1:9001/runtime/executions/stop-all",
    expect.objectContaining({
      method: "POST",
      headers: { "x-doolittle-desktop-control-token": token },
    }),
  );
  await runtime.stop();
  expect(engine.stopBot).toHaveBeenCalledOnce();
  expect(phases).toEqual(["booting", "ready", "stopped"]);
  unsubscribe();
});

it("keeps the app open and releases the startup hold when shutdown is unconfirmed", async () => {
  const allowStarts = vi.fn();
  const stopOwnedRuntimes = vi
    .fn()
    .mockRejectedValueOnce(new Error("Worker stop unconfirmed"))
    .mockResolvedValueOnce(undefined);
  const afterStopped = vi.fn(async () => undefined);
  const quit = vi.fn();
  const onFailure = vi.fn();
  const handleQuit = createDesktopQuitHandler({
    stopOwnedRuntimes,
    holdRuntimeStarts: () => allowStarts,
    afterStopped,
    setQuitting: vi.fn(),
    quit,
    onFailure,
  });
  const event = { preventDefault: vi.fn() };
  await handleQuit(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(allowStarts).toHaveBeenCalledOnce();
  expect(onFailure).toHaveBeenCalledOnce();
  expect(afterStopped).not.toHaveBeenCalled();
  expect(quit).not.toHaveBeenCalled();

  await handleQuit(event);
  expect(afterStopped).toHaveBeenCalledOnce();
  expect(quit).toHaveBeenCalledOnce();
});

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

it("retries a stream-level error and forwards a replay gap before a durable terminal error", async () => {
  const delta = 'event: response.output_text.delta\ndata: {"event_id":1}\n\n';
  const transport = 'event: error\ndata: {"message":"Stream failed."}\n\n';
  const gap = 'event: response.notice\ndata: {"code":"replay_gap"}\n\n';
  const terminal = 'event: error\ndata: {"event_id":3}\n\n';
  const fetchRuntime = vi
    .fn()
    .mockResolvedValueOnce(new Response(delta + transport))
    .mockResolvedValueOnce(new Response(gap + terminal));
  const onEvent = vi.fn();

  await followChatEventStream({
    runtimeUrl: "http://localhost",
    requestId: "run",
    signal: new AbortController().signal,
    fetchRuntime,
    onEvent,
  });

  expect(fetchRuntime).toHaveBeenLastCalledWith(
    "http://localhost/chat/runs/run/events?after=1",
    expect.anything(),
  );
  expect(
    onEvent.mock.calls.map(([frame, id, ended]) => [frame.event, id, ended]),
  ).toEqual([
    ["response.output_text.delta", 1, false],
    ["response.notice", undefined, false],
    ["error", 3, true],
  ]);
});
