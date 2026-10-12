import { EventEmitter } from "node:events";
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import type { BotProcessRegistry } from "./bot-process-registry";
import {
  isTrustedDesktopIpcSender,
  registerIpc,
  validateChatAttachmentIds,
  validateDesktopCommandRequest,
  validateInteractiveTerminalInputRequest,
  validateInteractiveTerminalResizeRequest,
  validateInteractiveTerminalStartRequest,
  validateTerminalStreamRequest,
  validateWorkspaceFileSaveRequest,
} from "./ipc";

const terminalStartRequestId = `${Date.now()}.62df6968-19be-4ea6-b7a1-479a57fa3b7c`;

describe("validateChatAttachmentIds", () => {
  const first = "62df6968-19be-4ea6-b7a1-479a57fa3b7c";
  const second = "88c9a480-6578-440b-9289-922d1cb9a4f4";

  it("normalizes bounded unique UUIDs", () => {
    expect(validateChatAttachmentIds(undefined)).toEqual([]);
    expect(validateChatAttachmentIds([first.toUpperCase(), second])).toEqual([
      first,
      second,
    ]);
  });

  it("rejects malformed, duplicate, and oversized selections", () => {
    expect(() => validateChatAttachmentIds(["../secret"])).toThrow(
      /attachment id/i,
    );
    expect(() => validateChatAttachmentIds([first, first])).toThrow(
      /duplicate/i,
    );
    expect(() =>
      validateChatAttachmentIds(Array.from({ length: 9 }, () => first)),
    ).toThrow(/at most 8/i);
  });
});

describe("desktop IPC sender authorization", () => {
  it("accepts only the live main window web contents", () => {
    const sender = {} as IpcMainInvokeEvent["sender"];
    const otherSender = {} as IpcMainInvokeEvent["sender"];
    const mainWindow = {
      isDestroyed: () => false,
      webContents: sender,
    } satisfies Pick<BrowserWindow, "isDestroyed" | "webContents">;

    expect(isTrustedDesktopIpcSender({ sender }, mainWindow)).toBe(true);
    expect(isTrustedDesktopIpcSender({ sender: otherSender }, mainWindow)).toBe(
      false,
    );
    expect(isTrustedDesktopIpcSender({ sender }, null)).toBe(false);
    expect(
      isTrustedDesktopIpcSender(
        { sender },
        { ...mainWindow, isDestroyed: () => true },
      ),
    ).toBe(false);
  });
});

describe("named bot request ownership", () => {
  it("rejects unknown and stopped bot targets without falling back to the lead runtime", async () => {
    const registry = {
      backendFor: vi.fn(async (id: string) => {
        throw new Error(
          id === "missing"
            ? "Bot not found or archived."
            : "The named bot is stopped.",
        );
      }),
    } as unknown as BotProcessRegistry;
    const requests = vi.fn(async () => new Response("{}"));
    const harness = createBotOwnershipHarness(registry, requests);
    const handler = harness.handlers.get("agent:request");
    for (const botId of ["missing", "stopped"]) {
      await expect(
        handler?.(harness.event, {
          botId,
          requestId: `request_${botId}`,
          path: "/sessions",
          method: "GET",
          headers: {},
        }),
      ).rejects.toThrow(botId === "missing" ? /not found/i : /stopped/i);
    }
    expect(requests).not.toHaveBeenCalled();
    harness.dispose();
  });

  it("does not let a bot cancel another bot's in-flight request", async () => {
    let abortRequest: (() => void) | undefined;
    const requests = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          abortRequest = () =>
            reject(new DOMException("Cancelled", "AbortError"));
          init?.signal?.addEventListener("abort", abortRequest, { once: true });
        }),
    );
    const runtime = {
      getState: () => ({ phase: "ready", url: "http://127.0.0.1:4556" }),
      getWorkspaceDirectory: () => "/workspace",
      subscribe: () => () => undefined,
    };
    const registry = {
      backendFor: vi.fn(async () => runtime),
    } as unknown as BotProcessRegistry;
    const harness = createBotOwnershipHarness(
      registry,
      requests as typeof fetch,
    );
    const pending = harness.handlers.get("agent:request")?.(harness.event, {
      botId: "bot-a",
      requestId: "same-request",
      path: "/sessions",
      method: "GET",
      headers: {},
    }) as Promise<unknown>;
    await vi.waitFor(() => expect(requests).toHaveBeenCalledOnce());
    expect(() =>
      harness.handlers.get("agent:request-cancel")?.(
        harness.event,
        "same-request",
        "bot-b",
      ),
    ).toThrow(/different bot/i);
    expect(abortRequest).toBeDefined();
    harness.handlers.get("agent:request-cancel")?.(
      harness.event,
      "same-request",
      "bot-a",
    );
    await expect(pending).rejects.toThrow(/abort/i);
    harness.dispose();
  });
});

function createBotOwnershipHarness(
  registry: BotProcessRegistry,
  requestFetch: typeof fetch,
) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  } as unknown as IpcMain;
  const sender = Object.assign(new EventEmitter(), {
    id: 22,
    isDestroyed: () => false,
    send: () => undefined,
  });
  const event = { sender } as unknown as IpcMainInvokeEvent;
  const backend = {
    getState: () => ({ phase: "ready", url: "http://127.0.0.1:4555" }),
    getWorkspaceDirectory: () => "/workspace",
    subscribe: () => () => undefined,
  } as unknown as BackendManager;
  const dispose = registerIpc({
    ipcMain,
    backend,
    bots: registry,
    getMainWindow: () => null,
    authorizeSender: () => true,
    pickFiles: async () => ({ canceled: true, paths: [] }),
    workspace: {
      getState: () => ({ currentPath: "/workspace", recentPaths: [] }),
      pickWorkspace: async () => ({
        canceled: true,
        state: { currentPath: "/workspace", recentPaths: [] },
      }),
      switchWorkspace: async () => ({
        canceled: true,
        state: { currentPath: "/workspace", recentPaths: [] },
      }),
      subscribe: () => () => undefined,
    },
    sensitiveActionDependencies: { fetch: requestFetch },
  });
  return { handlers, event, dispose };
}

describe("sensitive desktop actions", () => {
  function createHarness(options: {
    confirmed: boolean | (() => Promise<boolean>);
    fetch?: typeof fetch;
    durableFetch?: typeof fetch;
    notify?: (notification: { title: string; body: string }) => void;
    commitChatAttachments?: (request: {
      attachmentIds: string[];
      cleanupCapability: string;
    }) => void;
    senderAuthorized?: boolean;
    bots?: BotProcessRegistry;
    runtimeProcessId?: () => number;
    runtimeInstanceId?: () => string;
  }) {
    const confirmations: unknown[] = [];
    const handlers = new Map<
      string,
      (event: unknown, request: unknown) => unknown
    >();
    const removedChannels: string[] = [];
    const ipcMain = {
      handle: (
        channel: string,
        handler: (event: unknown, request: unknown) => unknown,
      ) => handlers.set(channel, handler),
      removeHandler: (channel: string) => {
        removedChannels.push(channel);
        handlers.delete(channel);
      },
    } as unknown as IpcMain;
    const backend = {
      getState: () => ({
        phase: "ready" as const,
        url: "http://127.0.0.1:4555",
        message: "ready",
      }),
      getWorkspaceDirectory: () => "/workspace",
      subscribe: () => () => undefined,
    } as unknown as BackendManager;
    // Most historical chat assertions describe the SSE payload itself. Adapt
    // those fixtures to the durable two-request transport while preserving
    // their focused event assertions; dedicated cases below assert the wire
    // split and resume behavior directly.
    const fetchWithLegacyChatFixture = options.durableFetch
      ? options.durableFetch
      : options.fetch
        ? async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith("/chat/runs") && init?.method === "POST") {
              const body = JSON.parse(String(init.body)) as { runId?: string };
              return new Response(JSON.stringify({ run_id: body.runId }), {
                status: 202,
                headers: { "content-type": "application/json" },
              });
            }
            if (/\/chat\/runs\/[^/]+\/events\?after=0$/u.test(url)) {
              return options.fetch?.(
                "http://127.0.0.1:4555/chat",
                init,
              ) as ReturnType<typeof fetch>;
            }
            return options.fetch(input, init);
          }
        : undefined;
    const dispose = registerIpc({
      ipcMain,
      backend,
      bots: options.bots,
      getMainWindow: () => null,
      authorizeSender: () => options.senderAuthorized ?? true,
      pickFiles: async () => ({ canceled: true, paths: [] }),
      commitChatAttachments: options.commitChatAttachments,
      workspace: {
        getState: () => ({ currentPath: "/workspace", recentPaths: [] }),
        pickWorkspace: async () => ({
          canceled: true,
          state: { currentPath: "/workspace", recentPaths: [] },
        }),
        switchWorkspace: async () => ({
          canceled: false,
          state: { currentPath: "/workspace", recentPaths: ["/workspace"] },
        }),
        subscribe: () => () => undefined,
      },
      sensitiveActionDependencies: {
        confirm: async (request) => {
          confirmations.push(request);
          return typeof options.confirmed === "function"
            ? options.confirmed()
            : options.confirmed;
        },
        fetch: fetchWithLegacyChatFixture
          ? async (input, init) => {
              const url = String(input);
              if (url.endsWith("/runtime/bot-identity")) {
                return Response.json({
                  processId: options.runtimeProcessId?.() ?? 1234,
                  runtimeInstanceId:
                    options.runtimeInstanceId?.() ??
                    "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
                });
              }
              const response = await fetchWithLegacyChatFixture(input, init);
              // Legacy fixtures predate in-band runtime receipts. Preserve any
              // explicit receipt supplied by a focused test.
              if (
                (url.includes("/terminal/session/start") ||
                  url.includes("/terminal/session/output")) &&
                response.headers
                  .get("content-type")
                  ?.includes("application/json")
              ) {
                const payload: unknown = await response.clone().json();
                if (
                  payload &&
                  typeof payload === "object" &&
                  !Array.isArray(payload) &&
                  !("runtimeInstanceId" in payload)
                ) {
                  return Response.json(
                    {
                      ...payload,
                      runtimeInstanceId:
                        options.runtimeInstanceId?.() ??
                        "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
                    },
                    { status: response.status },
                  );
                }
              }
              return response;
            }
          : undefined,
        notify: options.notify,
      },
    });
    return { handlers, removedChannels, confirmations, dispose };
  }

  function coldChatRuntime() {
    return {
      getState: () => ({
        phase: "ready" as const,
        url: "http://127.0.0.1:4666",
      }),
      getWorkspaceDirectory: () => "/workspace",
    } as unknown as BackendManager;
  }

  function coldChatBots(backendFor: () => Promise<BackendManager>) {
    return {
      assertConversationOwner: vi.fn((botId: string, roomId: string) => {
        if (botId !== "bot-a" || roomId !== "desktop:room-1") {
          throw new Error("Conversation belongs to a different bot.");
        }
        return { botId, projectId: "project-1" };
      }),
      assertRunOwner: vi.fn(async () => {
        throw new Error("Chat run is not owned by this bot.");
      }),
      backendFor: vi.fn(backendFor),
      get: vi.fn((botId: string) => ({ id: botId })),
      bindRun: vi.fn(),
      beginRun: vi.fn(),
      endRun: vi.fn(),
    } as unknown as BotProcessRegistry;
  }

  function coldChatRequest(requestId: string) {
    return {
      botId: "bot-a",
      requestId,
      message: "Start this named bot",
      roomId: "desktop:room-1",
      projectId: "project-1",
      workspacePath: "/workspace",
    };
  }

  function coldChatFetch() {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/chat/runs")) {
        const body = JSON.parse(String(init?.body)) as { runId: string };
        return Response.json(
          { run_id: body.runId, bot_id: "bot-a" },
          { status: 202 },
        );
      }
      return new Response(
        'event: response.completed\ndata: {"event_id":1,"response":"done"}\n\n',
        {
          headers: { "content-type": "text/event-stream" },
        },
      );
    });
  }

  function coldChatSender(id: number) {
    let destroyed = false;
    const sender = Object.assign(new EventEmitter(), {
      id,
      isDestroyed: () => destroyed,
      send: vi.fn(),
    });
    return {
      sender,
      destroy: () => {
        destroyed = true;
        sender.emit("destroyed");
      },
    };
  }

  it("cancels only the authorized pending chat while shared bot startup continues", async () => {
    let ready: ((runtime: BackendManager) => void) | undefined;
    const startup = new Promise<BackendManager>((resolve) => {
      ready = resolve;
    });
    const bots = coldChatBots(() => startup);
    const fetch = coldChatFetch();
    const harness = createHarness({
      confirmed: true,
      bots,
      durableFetch: fetch,
    });
    const { sender } = coldChatSender(300);
    const other = coldChatSender(301).sender;
    const firstRequest = coldChatRequest("chat:cold-first");
    const first = harness.handlers.get("chat:start")?.(
      { sender },
      firstRequest,
    ) as Promise<unknown>;
    const second = harness.handlers.get("chat:start")?.(
      { sender },
      coldChatRequest("chat:cold-second"),
    ) as Promise<unknown>;
    await expect(
      harness.handlers.get("chat:start")?.({ sender }, firstRequest),
    ).rejects.toThrow(/already running/i);
    await expect(
      harness.handlers.get("chat:cancel")?.(
        { sender },
        firstRequest.requestId,
        "bot-b",
      ),
    ).rejects.toThrow(/different bot/i);
    await expect(
      harness.handlers.get("chat:cancel")?.(
        { sender: other },
        firstRequest.requestId,
        "bot-a",
      ),
    ).rejects.toThrow(/not owned/i);
    await expect(
      harness.handlers.get("chat:cancel")?.(
        { sender },
        firstRequest.requestId,
        "bot-a",
      ),
    ).resolves.toBeUndefined();
    await expect(first).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(bots.assertRunOwner).toHaveBeenCalledOnce();
    ready?.(coldChatRuntime());
    await expect(second).resolves.toBeUndefined();
    expect(
      fetch.mock.calls.filter(([input]) =>
        String(input).endsWith("/chat/runs"),
      ),
    ).toHaveLength(1);
    expect(bots.bindRun).toHaveBeenCalledOnce();
    expect(bots.beginRun).toHaveBeenCalledOnce();
    await expect(
      harness.handlers.get("chat:start")?.({ sender }, firstRequest),
    ).resolves.toBeUndefined();
    expect(
      fetch.mock.calls.filter(([input]) =>
        String(input).endsWith("/chat/runs"),
      ),
    ).toHaveLength(2);
    harness.dispose();
  });

  it("does not submit a pending chat after its renderer is destroyed", async () => {
    let ready: ((runtime: BackendManager) => void) | undefined;
    const startup = new Promise<BackendManager>((resolve) => {
      ready = resolve;
    });
    const bots = coldChatBots(() => startup);
    const fetch = coldChatFetch();
    const harness = createHarness({
      confirmed: true,
      bots,
      durableFetch: fetch,
    });
    const { sender, destroy } = coldChatSender(302);
    const start = harness.handlers.get("chat:start")?.(
      { sender },
      coldChatRequest("chat:cold-destroy"),
    ) as Promise<unknown>;
    expect(sender.listenerCount("destroyed")).toBe(1);
    destroy();
    await expect(start).resolves.toBeUndefined();
    ready?.(coldChatRuntime());
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    expect(bots.bindRun).not.toHaveBeenCalled();
    expect(sender.listenerCount("destroyed")).toBe(0);
    harness.dispose();
  });

  it("does not start a bot for an already destroyed renderer", async () => {
    const bots = coldChatBots(async () => coldChatRuntime());
    const fetch = coldChatFetch();
    const harness = createHarness({
      confirmed: true,
      bots,
      durableFetch: fetch,
    });
    const { sender, destroy } = coldChatSender(304);
    destroy();
    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        coldChatRequest("chat:already-destroyed"),
      ),
    ).resolves.toBeUndefined();
    expect(bots.backendFor).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    harness.dispose();
  });

  it("defers server cancellation until an in-flight submission is accepted", async () => {
    let accept: ((response: Response) => void) | undefined;
    let submitted: () => void = () => undefined;
    const submissionStarted = new Promise<void>((resolve) => {
      submitted = resolve;
    });
    const bots = coldChatBots(async () => coldChatRuntime());
    vi.mocked(bots.assertRunOwner).mockResolvedValue(undefined);
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/chat/runs")) {
        submitted();
        return new Promise<Response>((resolve) => {
          accept = resolve;
        });
      }
      if (url.endsWith("/cancel")) {
        return Promise.resolve(Response.json({ accepted: true }));
      }
      if (url.includes("/events?")) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const harness = createHarness({
      confirmed: true,
      bots,
      durableFetch: fetch,
    });
    const { sender } = coldChatSender(305);
    const request = coldChatRequest("chat:deferred-cancel");
    const start = harness.handlers.get("chat:start")?.(
      { sender },
      request,
    ) as Promise<unknown>;
    await submissionStarted;
    const cancel = harness.handlers.get("chat:cancel")?.(
      { sender },
      request.requestId,
      request.botId,
    ) as Promise<unknown>;
    await Promise.resolve();
    expect(bots.assertRunOwner).not.toHaveBeenCalled();
    expect(
      fetch.mock.calls.some(([input]) => String(input).endsWith("/cancel")),
    ).toBe(false);
    accept?.(
      Response.json(
        { run_id: request.requestId, bot_id: request.botId },
        { status: 202 },
      ),
    );
    await expect(cancel).resolves.toBeUndefined();
    await expect(start).resolves.toBeUndefined();
    expect(bots.bindRun).toHaveBeenCalledOnce();
    expect(bots.beginRun).toHaveBeenCalledOnce();
    expect(bots.assertRunOwner).toHaveBeenCalledWith(
      request.botId,
      request.requestId,
    );
    expect(
      fetch.mock.calls.some(([input]) => String(input).endsWith("/cancel")),
    ).toBe(true);
    harness.dispose();
  });

  it("reports a failed queued Stop after receipt and keeps the run retryable", async () => {
    let accept: ((response: Response) => void) | undefined;
    let submitted: () => void = () => undefined;
    const submissionStarted = new Promise<void>((resolve) => {
      submitted = resolve;
    });
    const bots = coldChatBots(async () => coldChatRuntime());
    vi.mocked(bots.assertRunOwner).mockResolvedValue(undefined);
    let cancelCalls = 0;
    let streamSignal: AbortSignal | undefined;
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/chat/runs")) {
        submitted();
        return new Promise<Response>((resolve) => {
          accept = resolve;
        });
      }
      if (url.endsWith("/cancel")) {
        cancelCalls += 1;
        return Promise.resolve(
          cancelCalls === 1
            ? new Response("server stop failed", { status: 500 })
            : Response.json({ accepted: true }),
        );
      }
      if (url.includes("/events?")) {
        streamSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const harness = createHarness({
      confirmed: true,
      bots,
      durableFetch: fetch,
    });
    const { sender } = coldChatSender(308);
    const request = coldChatRequest("chat:queued-stop-fails");
    try {
      const start = harness.handlers.get("chat:start")?.(
        { sender },
        request,
      ) as Promise<unknown>;
      await submissionStarted;
      const stop = harness.handlers.get("chat:cancel")?.(
        { sender },
        request.requestId,
        request.botId,
      ) as Promise<unknown>;
      const failedStop = expect(stop).rejects.toThrow("server stop failed");
      accept?.(
        Response.json(
          { run_id: request.requestId, bot_id: request.botId },
          { status: 202 },
        ),
      );
      await failedStop;
      expect(cancelCalls).toBe(1);
      expect(streamSignal?.aborted).toBe(false);
      expect(
        sender.send.mock.calls.some(
          ([, payload]) =>
            (payload as { event?: string }).event === "cancelled",
        ),
      ).toBe(false);
      await expect(
        harness.handlers.get("chat:start")?.({ sender }, request),
      ).rejects.toThrow(/already running/i);
      await expect(
        harness.handlers.get("chat:cancel")?.(
          { sender },
          request.requestId,
          request.botId,
        ),
      ).resolves.toBeUndefined();
      await expect(start).resolves.toBeUndefined();
      expect(cancelCalls).toBe(2);
      expect(bots.bindRun).toHaveBeenCalledOnce();
    } finally {
      harness.dispose();
    }
  });

  it("times out an unconfirmed Stop but cancels once a late receipt arrives", async () => {
    vi.useFakeTimers();
    let accept: ((response: Response) => void) | undefined;
    let submitted: () => void = () => undefined;
    let cancellationSent: () => void = () => undefined;
    const submissionStarted = new Promise<void>((resolve) => {
      submitted = resolve;
    });
    const serverCancellation = new Promise<void>((resolve) => {
      cancellationSent = resolve;
    });
    const bots = coldChatBots(async () => coldChatRuntime());
    vi.mocked(bots.assertRunOwner).mockResolvedValue(undefined);
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/chat/runs")) {
        submitted();
        return new Promise<Response>((resolve) => {
          accept = resolve;
        });
      }
      if (url.endsWith("/cancel")) {
        cancellationSent();
        return Promise.resolve(Response.json({ accepted: true }));
      }
      if (url.includes("/events?")) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const harness = createHarness({
      confirmed: true,
      bots,
      durableFetch: fetch,
    });
    try {
      const { sender } = coldChatSender(306);
      const request = coldChatRequest("chat:late-receipt");
      const start = harness.handlers.get("chat:start")?.(
        { sender },
        request,
      ) as Promise<unknown>;
      await submissionStarted;
      const stop = harness.handlers.get("chat:cancel")?.(
        { sender },
        request.requestId,
        request.botId,
      ) as Promise<unknown>;
      const repeatStop = harness.handlers.get("chat:cancel")?.(
        { sender },
        request.requestId,
        request.botId,
      ) as Promise<unknown>;
      const firstOutcome = expect(stop).rejects.toThrow(/unconfirmed/i);
      const secondOutcome = expect(repeatStop).rejects.toThrow(/unconfirmed/i);
      await expect(
        harness.handlers.get("chat:cancel")?.(
          { sender },
          request.requestId,
          "bot-b",
        ),
      ).rejects.toThrow(/different bot/i);
      await vi.advanceTimersByTimeAsync(15_000);
      await Promise.all([firstOutcome, secondOutcome]);
      expect(bots.assertRunOwner).not.toHaveBeenCalled();
      expect(
        fetch.mock.calls.some(([input]) => String(input).endsWith("/cancel")),
      ).toBe(false);
      const post = fetch.mock.calls.find(([input]) =>
        String(input).endsWith("/chat/runs"),
      );
      expect(post?.[1]?.signal?.aborted).toBe(false);
      await expect(
        harness.handlers.get("chat:start")?.({ sender }, request),
      ).rejects.toThrow(/already running/i);
      accept?.(
        Response.json(
          { run_id: request.requestId, bot_id: request.botId },
          { status: 202 },
        ),
      );
      await serverCancellation;
      await expect(start).resolves.toBeUndefined();
      expect(bots.bindRun).toHaveBeenCalledOnce();
      expect(bots.beginRun).toHaveBeenCalledOnce();
      expect(bots.assertRunOwner).toHaveBeenCalledOnce();
      expect(
        fetch.mock.calls.filter(([input]) => String(input).endsWith("/cancel")),
      ).toHaveLength(1);
    } finally {
      harness.dispose();
      vi.useRealTimers();
    }
  });

  it("keeps a late accepted chat active after cancel failure and retries Stop", async () => {
    vi.useFakeTimers();
    let accept: ((response: Response) => void) | undefined;
    let failFirstCancel: ((response: Response) => void) | undefined;
    let submitted: () => void = () => undefined;
    let firstCancelSent: () => void = () => undefined;
    const submissionStarted = new Promise<void>((resolve) => {
      submitted = resolve;
    });
    const firstServerCancel = new Promise<void>((resolve) => {
      firstCancelSent = resolve;
    });
    const bots = coldChatBots(async () => coldChatRuntime());
    vi.mocked(bots.assertRunOwner).mockResolvedValue(undefined);
    let cancelCalls = 0;
    let streamSignal: AbortSignal | undefined;
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/chat/runs")) {
        submitted();
        return new Promise<Response>((resolve) => {
          accept = resolve;
        });
      }
      if (url.endsWith("/cancel")) {
        cancelCalls += 1;
        if (cancelCalls === 1) {
          firstCancelSent();
          return new Promise<Response>((resolve) => {
            failFirstCancel = resolve;
          });
        }
        return Promise.resolve(Response.json({ accepted: true }));
      }
      if (url.includes("/events?")) {
        streamSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const harness = createHarness({
      confirmed: true,
      bots,
      durableFetch: fetch,
    });
    try {
      const { sender } = coldChatSender(307);
      const request = coldChatRequest("chat:late-cancel-retry");
      const start = harness.handlers.get("chat:start")?.(
        { sender },
        request,
      ) as Promise<unknown>;
      await submissionStarted;
      const stop = harness.handlers.get("chat:cancel")?.(
        { sender },
        request.requestId,
        request.botId,
      ) as Promise<unknown>;
      const timedOut = expect(stop).rejects.toThrow(/unconfirmed/i);
      await vi.advanceTimersByTimeAsync(15_000);
      await timedOut;
      accept?.(
        Response.json(
          { run_id: request.requestId, bot_id: request.botId },
          { status: 202 },
        ),
      );
      await firstServerCancel;
      const concurrentStop = harness.handlers.get("chat:cancel")?.(
        { sender },
        request.requestId,
        request.botId,
      ) as Promise<unknown>;
      expect(cancelCalls).toBe(1);
      failFirstCancel?.(
        Response.json({ error: "temporary failure" }, { status: 500 }),
      );
      await expect(concurrentStop).rejects.toThrow(/temporary failure/i);
      expect(streamSignal?.aborted).toBe(false);
      expect(
        sender.send.mock.calls.some(
          ([, payload]) =>
            (payload as { event?: string }).event === "cancelled",
        ),
      ).toBe(false);
      await expect(
        harness.handlers.get("chat:start")?.({ sender }, request),
      ).rejects.toThrow(/already running/i);
      await expect(
        harness.handlers.get("chat:cancel")?.(
          { sender },
          request.requestId,
          request.botId,
        ),
      ).resolves.toBeUndefined();
      await expect(start).resolves.toBeUndefined();
      expect(cancelCalls).toBe(2);
      expect(bots.bindRun).toHaveBeenCalledOnce();
      expect(bots.beginRun).toHaveBeenCalledOnce();
    } finally {
      harness.dispose();
      vi.useRealTimers();
    }
  });

  it("cleans up failed bot startup so the same chat ID can be retried", async () => {
    let attempts = 0;
    const bots = coldChatBots(async () => {
      if (attempts++ === 0) throw new Error("Bot startup failed.");
      return coldChatRuntime();
    });
    const fetch = coldChatFetch();
    const harness = createHarness({
      confirmed: true,
      bots,
      durableFetch: fetch,
    });
    const { sender } = coldChatSender(303);
    const request = coldChatRequest("chat:cold-retry");
    await expect(
      harness.handlers.get("chat:start")?.({ sender }, request),
    ).rejects.toThrow("Bot startup failed.");
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      harness.handlers.get("chat:start")?.({ sender }, request),
    ).resolves.toBeUndefined();
    expect(
      fetch.mock.calls.filter(([input]) =>
        String(input).endsWith("/chat/runs"),
      ),
    ).toHaveLength(1);
    harness.dispose();
  });

  it("disposes exactly the handlers it registers", () => {
    const harness = createHarness({ confirmed: true });
    const registeredChannels = [...harness.handlers.keys()].sort();

    harness.dispose();

    expect(harness.removedChannels.sort()).toEqual(registeredChannels);
    expect(harness.handlers.size).toBe(0);
  });

  it("rejects every request from an untrusted renderer", () => {
    const harness = createHarness({
      confirmed: true,
      senderAuthorized: false,
    });
    const handler = harness.handlers.get("backend:get-state");

    expect(() => handler?.({}, undefined)).toThrow(/untrusted sender/iu);
    expect(() =>
      harness.handlers.get("repository:create-worktree-confirmed")?.({}, {}),
    ).toThrow(/untrusted sender/iu);
  });

  it("bridges bounded responses without hiding Eliza HTTP metadata", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const harness = createHarness({
      confirmed: true,
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(
          JSON.stringify({
            error: "The agent is busy.",
            code: "rate_limit_exceeded",
          }),
          {
            status: 429,
            statusText: "Too Many Requests",
            headers: {
              "content-type": "application/json",
              "retry-after": "7",
              "set-cookie": "private=value",
            },
          },
        );
      },
    });

    const handler = harness.handlers.get("agent:request");
    const sender = Object.assign(new EventEmitter(), { id: 1 });
    await expect(
      handler?.(
        { sender },
        {
          requestId: "test-agent-request",
          path: "/settings",
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-elizaos-client-id": "ui-client-1",
            authorization: "Bearer renderer-secret",
          },
          body: JSON.stringify({ theme: "system" }),
        },
      ),
    ).resolves.toEqual({
      status: 429,
      statusText: "Too Many Requests",
      headers: {
        "content-type": "application/json",
        "retry-after": "7",
      },
      body: JSON.stringify({
        error: "The agent is busy.",
        code: "rate_limit_exceeded",
      }),
    });
    expect(requests).toEqual([
      {
        url: "http://127.0.0.1:4555/settings",
        init: expect.objectContaining({
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-elizaos-client-id": "ui-client-1",
          },
          body: JSON.stringify({ theme: "system" }),
        }),
      },
    ]);
    expect(harness.handlers.has("api:request")).toBe(false);
    harness.dispose();
  });

  it("aborts an agent request when its renderer is destroyed", async () => {
    let requestSignal: AbortSignal | undefined;
    const harness = createHarness({
      confirmed: true,
      fetch: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          requestSignal = init?.signal ?? undefined;
          requestSignal?.addEventListener(
            "abort",
            () => reject(requestSignal?.reason),
            { once: true },
          );
        }),
    });
    const sender = Object.assign(new EventEmitter(), { id: 8 });
    const pending = harness.handlers.get("agent:request")?.(
      { sender },
      {
        requestId: "renderer-lifecycle",
        path: "/health",
        method: "GET",
        headers: {},
      },
    ) as Promise<unknown>;
    await vi.waitFor(() => expect(requestSignal).toBeDefined());

    sender.emit("destroyed");

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(requestSignal?.aborted).toBe(true);
    harness.dispose();
  });

  it("shares one renderer lifecycle listener across concurrent requests", async () => {
    const requestSignals: AbortSignal[] = [];
    const harness = createHarness({
      confirmed: true,
      fetch: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) throw new Error("Expected a request abort signal.");
          requestSignals.push(signal);
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    });
    const sender = Object.assign(new EventEmitter(), { id: 9 });
    const pending = Array.from({ length: 12 }, (_, index) =>
      harness.handlers.get("agent:request")?.(
        { sender },
        {
          requestId: `parallel-${index}`,
          path: "/health",
          method: "GET",
          headers: {},
        },
      ),
    ) as Promise<unknown>[];
    await vi.waitFor(() => expect(requestSignals).toHaveLength(12));

    expect(sender.listenerCount("destroyed")).toBe(1);
    sender.emit("destroyed");

    const results = await Promise.allSettled(pending);
    expect(results).toHaveLength(12);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(requestSignals.every((signal) => signal.aborted)).toBe(true);
    expect(sender.listenerCount("destroyed")).toBe(0);
    harness.dispose();
  });

  it("strictly validates commands and workspace save requests", () => {
    expect(validateDesktopCommandRequest({ command: "  bun test  " })).toEqual({
      command: "bun test",
      timeoutMs: 30_000,
    });
    expect(() =>
      validateDesktopCommandRequest({ command: "pwd", timeoutMs: 999 }),
    ).toThrow(/timeout/);
    expect(() =>
      validateDesktopCommandRequest({ command: `printf '${"\0"}'` }),
    ).toThrow(/null/);
    expect(
      validateTerminalStreamRequest({
        requestId: "terminal:run-1",
        command: " bun test ",
        timeoutMs: 12_000,
      }),
    ).toEqual({
      requestId: "terminal:run-1",
      command: "bun test",
      timeoutMs: 12_000,
    });
    expect(() =>
      validateTerminalStreamRequest({
        requestId: "../escape",
        command: "pwd",
      }),
    ).toThrow(/request id/);
    expect(
      validateInteractiveTerminalStartRequest({
        requestId: terminalStartRequestId,
        originConversationId: "conversation-1",
        workspacePath: "/workspace",
        cols: 120,
        rows: 40,
      }),
    ).toEqual({
      requestId: terminalStartRequestId,
      originConversationId: "conversation-1",
      workspacePath: "/workspace",
      cols: 120,
      rows: 40,
    });
    expect(
      validateInteractiveTerminalStartRequest({
        requestId: terminalStartRequestId,
        originConversationId: "conversation-1",
        workspacePath: "/workspace",
        cols: 120,
        rows: 40,
        reconcileOnly: true,
      }),
    ).toMatchObject({ reconcileOnly: true });
    expect(() =>
      validateInteractiveTerminalStartRequest({
        requestId: terminalStartRequestId,
        originConversationId: "conversation-1",
        workspacePath: "/workspace",
        cols: 120,
        rows: 40,
        reconcileOnly: "true",
      }),
    ).toThrow(/reconciliation mode/);
    expect(() =>
      validateInteractiveTerminalStartRequest({
        requestId: terminalStartRequestId,
        originConversationId: "conversation-1",
        workspacePath: "/workspace",
        cols: 10,
        rows: 40,
      }),
    ).toThrow(/columns/);
    expect(
      validateInteractiveTerminalInputRequest({
        sessionId: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
        data: "bun test\n",
      }),
    ).toEqual({
      sessionId: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
      data: "bun test\n",
    });
    expect(() =>
      validateInteractiveTerminalInputRequest({
        sessionId: "../escape",
        data: "pwd\n",
      }),
    ).toThrow(/session id/);
    expect(
      validateInteractiveTerminalResizeRequest({
        sessionId: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
        cols: 80,
        rows: 24,
      }),
    ).toEqual({
      sessionId: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
      cols: 80,
      rows: 24,
    });

    expect(
      validateWorkspaceFileSaveRequest({
        path: "src/index.ts",
        content: "after",
        expectedContent: "before",
      }),
    ).toEqual({
      path: "src/index.ts",
      content: "after",
      expectedContent: "before",
    });
    for (const path of [
      "/etc/passwd",
      "C:/Windows/system.ini",
      "../secret",
      "src/../secret",
      "src%2F..%2Fsecret",
      "src\\index.ts",
      "src/\0index.ts",
    ]) {
      expect(() =>
        validateWorkspaceFileSaveRequest({
          path,
          content: "after",
          expectedContent: "before",
        }),
      ).toThrow();
    }
  });

  it("does not fetch when native confirmation is cancelled", async () => {
    let fetches = 0;
    const harness = createHarness({
      confirmed: false,
      fetch: async () => {
        fetches += 1;
        return new Response();
      },
    });

    const commandHandler = harness.handlers.get("terminal:run-confirmed");
    const saveHandler = harness.handlers.get("workspace:save-confirmed");
    expect(
      await commandHandler?.({}, { command: "pwd", timeoutMs: 5_000 }),
    ).toEqual({ status: "cancelled" });
    expect(
      await saveHandler?.(
        {},
        { path: "notes.txt", content: "after", expectedContent: "before" },
      ),
    ).toEqual({ status: "cancelled" });
    expect(fetches).toBe(0);
    harness.dispose();
  });

  it("posts bounded commands only after confirmation", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const harness = createHarness({
      confirmed: true,
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return Response.json({
          result: { command: "bun test", exitCode: 0, stdout: "pass" },
        });
      },
    });

    const handler = harness.handlers.get("terminal:run-confirmed");
    await expect(
      handler?.({}, { command: " bun test ", timeoutMs: 12_000 }),
    ).resolves.toEqual({
      status: "completed",
      result: { command: "bun test", exitCode: 0, stdout: "pass" },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("http://127.0.0.1:4555/terminal/run");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      command: "bun test",
      timeoutMs: 12_000,
    });
    harness.dispose();
  });

  it("forwards only opaque attachment ids to chat and rejects command attachments", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const harness = createHarness({
      confirmed: true,
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(
          ['event: response.completed\ndata: {"response":"reviewed"}', ""].join(
            "\n\n",
          ),
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const attachmentId = "62df6968-19be-4ea6-b7a1-479a57fa3b7c";
    const sender = {
      id: 72,
      isDestroyed: () => false,
      send: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
    };
    const handler = harness.handlers.get("chat:start");
    const result = await Promise.resolve(
      handler?.(
        { sender },
        {
          requestId: "chat:attachment-1",
          message: "Review this file",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
          projectId: "project-1",
          attachmentIds: [attachmentId],
        },
      ),
    ).catch((error) => error);
    expect(result).toBeUndefined();

    // The legacy fixture receives the event-feed connection; submission wire
    // coverage lives in the durable transport test below.
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("http://127.0.0.1:4555/chat");
    await expect(
      handler?.(
        { sender: { ...sender, id: 75 } },
        {
          requestId: "chat:stale-workspace",
          message: "Run this in the old workspace",
          roomId: "desktop:room-1",
          workspacePath: "/previous-workspace",
        },
      ),
    ).rejects.toThrow(/workspace changed/i);
    await expect(
      handler?.(
        { sender: { ...sender, id: 76 } },
        {
          requestId: "chat:missing-workspace",
          message: "Run without an identity",
          roomId: "desktop:room-1",
        },
      ),
    ).rejects.toThrow(/workspace path/i);
    await expect(
      handler?.(
        { sender: { ...sender, id: 73 } },
        {
          requestId: "chat:attachment-command",
          message: "/status",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
          attachmentIds: [attachmentId],
        },
      ),
    ).rejects.toThrow(/command messages/i);
    await expect(
      handler?.(
        { sender: { ...sender, id: 74 } },
        {
          requestId: "chat:invalid-project",
          message: "Review this file",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
          projectId: "../outside",
        },
      ),
    ).rejects.toThrow(/project id/i);
    expect(requests).toHaveLength(1);
    harness.dispose();
  });

  it("commits opaque attachment leases once the runtime accepts a turn", async () => {
    const commits: Array<{
      attachmentIds: string[];
      cleanupCapability: string;
    }> = [];
    const attachmentId = "62df6968-19be-4ea6-b7a1-479a57fa3b7c";
    const cleanupCapability = "08b30dcb-5036-4a5e-a697-7ba99d5e5d58";
    const harness = createHarness({
      confirmed: true,
      commitChatAttachments: (request) => commits.push(request),
      durableFetch: async (input) => {
        const url = String(input);
        if (url.endsWith("/chat/runs")) {
          return Response.json(
            { run_id: "chat:commit-lease" },
            { status: 202 },
          );
        }
        return new Response(
          'event: response.completed\ndata: {"event_id":1,"response":"done"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const sender = {
      id: 86,
      isDestroyed: () => false,
      send: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:commit-lease",
          message: "Review this file",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
          attachmentIds: [attachmentId],
          attachmentCleanup: { [attachmentId]: cleanupCapability },
        },
      ),
    ).resolves.toBeUndefined();
    expect(commits).toEqual([
      { botId: "default", attachmentIds: [attachmentId], cleanupCapability },
    ]);
    harness.dispose();
  });

  it("keeps an accepted chat alive when attachment finalization fails", async () => {
    const attachmentId = "62df6968-19be-4ea6-b7a1-479a57fa3b7c";
    const emitted: Array<Record<string, unknown>> = [];
    const harness = createHarness({
      confirmed: true,
      commitChatAttachments: () => {
        throw new Error("lease store unavailable");
      },
      durableFetch: async (input) => {
        if (String(input).endsWith("/chat/runs")) {
          return Response.json(
            { run_id: "chat:commit-failure" },
            { status: 202 },
          );
        }
        return new Response(
          'event: response.completed\ndata: {"event_id":1,"response":"done"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const sender = {
      id: 87,
      isDestroyed: () => false,
      send: (_channel: string, event: Record<string, unknown>) =>
        emitted.push(event),
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:commit-failure",
          message: "Review this file",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
          attachmentIds: [attachmentId],
          attachmentCleanup: {
            [attachmentId]: "08b30dcb-5036-4a5e-a697-7ba99d5e5d58",
          },
        },
      ),
    ).resolves.toBeUndefined();
    expect(emitted).toContainEqual({
      requestId: "chat:commit-failure",
      event: "attachment.warning",
      data: {
        message:
          "Attachment cleanup needs attention. Your response is still running.",
      },
    });
    harness.dispose();
  });

  it("submits once and reconnects its durable event feed after EOF without replaying events", async () => {
    const requests: string[] = [];
    const emitted: Array<Record<string, unknown>> = [];
    let eventFeedAttempts = 0;
    const harness = createHarness({
      confirmed: true,
      durableFetch: async (input, init) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/chat/runs")) {
          expect(init?.method).toBe("POST");
          return new Response(JSON.stringify({ run_id: "chat:durable" }), {
            status: 202,
            headers: { "content-type": "application/json" },
          });
        }
        eventFeedAttempts += 1;
        if (eventFeedAttempts === 1) {
          return new Response(
            'event: response.output_text.delta\ndata: {"event_id":7,"delta":"first"}\n\n',
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        return new Response(
          [
            'event: response.output_text.delta\ndata: {"event_id":7,"delta":"first"}',
            'event: response.output_text.delta\ndata: {"event_id":8,"delta":"second"}',
            'event: response.completed\ndata: {"event_id":9,"response":"done"}',
            "",
          ].join("\n\n"),
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const sender = {
      id: 88,
      isDestroyed: () => false,
      send: (_channel: string, event: Record<string, unknown>) =>
        emitted.push(event),
      once: () => undefined,
      removeListener: () => undefined,
    };
    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:durable",
          message: "resume me",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
        },
      ),
    ).resolves.toBeUndefined();
    expect(requests).toEqual([
      "http://127.0.0.1:4555/chat/runs",
      "http://127.0.0.1:4555/chat/runs/chat%3Adurable/events?after=0",
      "http://127.0.0.1:4555/chat/runs/chat%3Adurable/events?after=7",
    ]);
    expect(emitted).toEqual([
      {
        requestId: "chat:durable",
        event: "response.output_text.delta",
        eventId: 7,
        data: { event_id: 7, delta: "first" },
      },
      {
        requestId: "chat:durable",
        event: "response.output_text.delta",
        eventId: 8,
        data: { event_id: 8, delta: "second" },
      },
      {
        requestId: "chat:durable",
        event: "response.completed",
        eventId: 9,
        data: { event_id: 9, response: "done" },
      },
    ]);
    harness.dispose();
  });

  it("reconnects a durable event feed after a transient fetch failure", async () => {
    const requests: string[] = [];
    let eventFeedAttempts = 0;
    const harness = createHarness({
      confirmed: true,
      durableFetch: async (input, init) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/chat/runs")) {
          expect(init?.method).toBe("POST");
          return Response.json({ run_id: "chat:fetch-retry" }, { status: 202 });
        }
        eventFeedAttempts += 1;
        if (eventFeedAttempts === 1)
          throw new Error("temporary network failure");
        return new Response(
          'event: response.completed\ndata: {"event_id":1,"response":"done"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const sender = {
      id: 89,
      isDestroyed: () => false,
      send: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:fetch-retry",
          message: "resume me",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
        },
      ),
    ).resolves.toBeUndefined();
    expect(requests).toEqual([
      "http://127.0.0.1:4555/chat/runs",
      "http://127.0.0.1:4555/chat/runs/chat%3Afetch-retry/events?after=0",
      "http://127.0.0.1:4555/chat/runs/chat%3Afetch-retry/events?after=0",
    ]);
    harness.dispose();
  });

  it("reconnects a restored chat after EOF without replaying cursor overlap", async () => {
    const requests: string[] = [];
    const emitted: Array<Record<string, unknown>> = [];
    let attempts = 0;
    const harness = createHarness({
      confirmed: true,
      durableFetch: async (input) => {
        requests.push(String(input));
        attempts += 1;
        return new Response(
          attempts === 1
            ? 'event: response.output_text.delta\ndata: {"event_id":5,"delta":"first"}\n\n'
            : [
                'event: response.output_text.delta\ndata: {"event_id":5,"delta":"first"}',
                'event: response.completed\ndata: {"event_id":6,"response":"done"}',
                "",
              ].join("\n\n"),
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const sender = {
      id: 90,
      isDestroyed: () => false,
      send: (_channel: string, payload: Record<string, unknown>) =>
        emitted.push(payload),
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:subscribe")?.(
        { sender },
        { requestId: "chat:restored-eof", after: 4 },
      ),
    ).resolves.toBeUndefined();
    expect(requests).toEqual([
      "http://127.0.0.1:4555/chat/runs/chat%3Arestored-eof/events?after=4",
      "http://127.0.0.1:4555/chat/runs/chat%3Arestored-eof/events?after=5",
    ]);
    expect(emitted).toEqual([
      {
        requestId: "chat:restored-eof",
        event: "response.output_text.delta",
        eventId: 5,
        data: { event_id: 5, delta: "first" },
      },
      {
        requestId: "chat:restored-eof",
        event: "response.completed",
        eventId: 6,
        data: { event_id: 6, response: "done" },
      },
    ]);
    harness.dispose();
  });

  it("reconnects a restored chat after transient fetch and reader failures", async () => {
    const requests: string[] = [];
    const encoder = new TextEncoder();
    let attempts = 0;
    const harness = createHarness({
      confirmed: true,
      durableFetch: async (input) => {
        requests.push(String(input));
        attempts += 1;
        if (attempts === 1) throw new Error("temporary network failure");
        if (attempts === 2) {
          let reads = 0;
          return {
            ok: true,
            body: {
              getReader: () => ({
                read: async () => {
                  if (reads++ === 0) {
                    return {
                      done: false,
                      value: encoder.encode(
                        'event: response.output_text.delta\ndata: {"event_id":2,"delta":"partial"}\n\n',
                      ),
                    };
                  }
                  throw new Error("temporary read failure");
                },
              }),
            },
          } as unknown as Response;
        }
        return new Response(
          'event: response.completed\ndata: {"event_id":3,"response":"done"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const sender = {
      id: 91,
      isDestroyed: () => false,
      send: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:subscribe")?.(
        { sender },
        { requestId: "chat:restored-transient" },
      ),
    ).resolves.toBeUndefined();
    expect(requests).toEqual([
      "http://127.0.0.1:4555/chat/runs/chat%3Arestored-transient/events?after=0",
      "http://127.0.0.1:4555/chat/runs/chat%3Arestored-transient/events?after=0",
      "http://127.0.0.1:4555/chat/runs/chat%3Arestored-transient/events?after=2",
    ]);
    harness.dispose();
  });

  it("surfaces one restored-chat error after retry exhaustion and cleans up", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    let attempts = 0;
    const harness = createHarness({
      confirmed: true,
      durableFetch: async () => {
        attempts += 1;
        if (attempts <= 3) throw new Error("network unavailable");
        return new Response(
          'event: response.completed\ndata: {"event_id":1,"response":"recovered"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const sender = {
      id: 92,
      isDestroyed: () => false,
      send: (_channel: string, payload: Record<string, unknown>) =>
        emitted.push(payload),
      once: () => undefined,
      removeListener: () => undefined,
    };
    const request = { requestId: "chat:restored-exhaustion" };

    await expect(
      harness.handlers.get("chat:subscribe")?.({ sender }, request),
    ).rejects.toThrow(
      /unable to reconnect to the chat response after 2 retries/i,
    );
    expect(emitted).toEqual([
      {
        requestId: "chat:restored-exhaustion",
        event: "error",
        data: {
          message:
            "Unable to reconnect to the chat response after 2 retries. Please try again.",
        },
      },
    ]);
    await expect(
      harness.handlers.get("chat:subscribe")?.({ sender }, request),
    ).resolves.toBeUndefined();
    expect(attempts).toBe(4);
    harness.dispose();
  });

  it("does not retry a definitive restored-chat response error", async () => {
    const requests: string[] = [];
    const emitted: Array<Record<string, unknown>> = [];
    const harness = createHarness({
      confirmed: true,
      durableFetch: async (input) => {
        requests.push(String(input));
        return new Response(JSON.stringify({ error: "Run not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const sender = {
      id: 93,
      isDestroyed: () => false,
      send: (_channel: string, payload: Record<string, unknown>) =>
        emitted.push(payload),
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:subscribe")?.(
        { sender },
        { requestId: "chat:restored-missing" },
      ),
    ).rejects.toThrow(/run not found/i);
    expect(requests).toHaveLength(1);
    expect(emitted).toEqual([
      {
        requestId: "chat:restored-missing",
        event: "error",
        data: { message: "Run not found" },
      },
    ]);
    harness.dispose();
  });

  it("does not reconnect a restored chat after explicit cancellation", async () => {
    const requests: string[] = [];
    let markStreamRequested: () => void = () => undefined;
    const streamRequested = new Promise<void>((resolve) => {
      markStreamRequested = resolve;
    });
    const harness = createHarness({
      confirmed: true,
      durableFetch: async (input) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/cancel")) {
          return Response.json({
            accepted: true,
            run: {
              runId: "chat:restored-cancel",
              sessionId: "desktop:room-1",
              status: "cancelled",
              terminalReason: "cancelled",
            },
          });
        }
        markStreamRequested();
        return new Response(
          'event: response.output_text.delta\ndata: {"event_id":1,"delta":"partial"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const sender = {
      id: 93,
      isDestroyed: () => false,
      send: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
    };
    const start = harness.handlers.get("chat:subscribe")?.(
      { sender },
      { requestId: "chat:restored-cancel" },
    ) as Promise<unknown>;

    await streamRequested;
    await expect(
      harness.handlers.get("chat:cancel")?.({ sender }, "chat:restored-cancel"),
    ).resolves.toBeUndefined();
    await expect(start).resolves.toBeUndefined();
    expect(requests.filter((url) => url.includes("/events?")).length).toBe(1);
    harness.dispose();
  });

  it("forwards only one terminal event for a restored chat", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const harness = createHarness({
      confirmed: true,
      durableFetch: async () =>
        new Response(
          [
            'event: response.completed\ndata: {"event_id":1,"response":"first"}',
            'event: response.completed\ndata: {"event_id":2,"response":"duplicate"}',
            "",
          ].join("\n\n"),
          { headers: { "content-type": "text/event-stream" } },
        ),
    });
    const sender = {
      id: 94,
      isDestroyed: () => false,
      send: (_channel: string, payload: Record<string, unknown>) =>
        emitted.push(payload),
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:subscribe")?.(
        { sender },
        { requestId: "chat:restored-terminal" },
      ),
    ).resolves.toBeUndefined();
    expect(emitted).toEqual([
      {
        requestId: "chat:restored-terminal",
        event: "response.completed",
        eventId: 1,
        data: { event_id: 1, response: "first" },
      },
    ]);
    harness.dispose();
  });

  it("reports a chat stream that closes before a terminal event", async () => {
    const events: Array<{ requestId: string; event: string; data: unknown }> =
      [];
    const harness = createHarness({
      confirmed: true,
      fetch: async () =>
        new Response(
          'event: response.output_text.delta\ndata: {"event_id":1,"delta":"partial"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    });
    const sender = {
      id: 73,
      isDestroyed: () => false,
      send: (_channel: string, event: (typeof events)[number]) =>
        events.push(event),
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:eof",
          message: "stream request",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
        },
      ),
    ).rejects.toThrow(
      /unable to reconnect to the chat response after 2 retries/i,
    );

    expect(events).toEqual([
      {
        requestId: "chat:eof",
        event: "response.output_text.delta",
        eventId: 1,
        data: { event_id: 1, delta: "partial" },
      },
      {
        requestId: "chat:eof",
        event: "error",
        data: {
          message:
            "Unable to reconnect to the chat response after 2 retries. Please try again.",
        },
      },
    ]);
    harness.dispose();
  });

  it("flushes a split UTF-8 tail before finishing a chat stream", async () => {
    const events: Array<{ requestId: string; event: string; data: unknown }> =
      [];
    const bytes = new TextEncoder().encode(
      "event: response.completed\ndata: 😀",
    );
    const harness = createHarness({
      confirmed: true,
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes.slice(0, -1));
              controller.enqueue(bytes.slice(-1));
              controller.close();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
    });
    const sender = {
      id: 74,
      isDestroyed: () => false,
      send: (_channel: string, event: (typeof events)[number]) =>
        events.push(event),
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:utf8-tail",
          message: "stream request",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
        },
      ),
    ).resolves.toBeUndefined();
    expect(events).toContainEqual({
      requestId: "chat:utf8-tail",
      event: "response.completed",
      data: "😀",
    });
    harness.dispose();
  });

  it("does not emit a second terminal event after a completed response", async () => {
    const events: Array<{ requestId: string; event: string; data: unknown }> =
      [];
    const encoder = new TextEncoder();
    const harness = createHarness({
      confirmed: true,
      fetch: async () => {
        let readCount = 0;
        return {
          ok: true,
          body: {
            getReader: () => ({
              read: async () => {
                if (readCount++ === 0) {
                  return {
                    done: false,
                    value: encoder.encode(
                      'event: response.completed\ndata: {"response":"done"}\n\n',
                    ),
                  };
                }
                throw new Error("late transport failure");
              },
            }),
          },
        } as unknown as Response;
      },
    });
    const sender = {
      id: 75,
      isDestroyed: () => false,
      send: (_channel: string, event: (typeof events)[number]) =>
        events.push(event),
      once: () => undefined,
      removeListener: () => undefined,
    };

    const result = await Promise.resolve(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:late-failure",
          message: "stream request",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
        },
      ),
    ).catch((error) => error);
    expect(result).toBeUndefined();

    expect(events).toEqual([
      {
        requestId: "chat:late-failure",
        event: "response.completed",
        data: { response: "done" },
      },
    ]);
    harness.dispose();
  });

  it("emits privacy-safe chat completion notifications", async () => {
    const notifications: Array<{ title: string; body: string }> = [];
    const harness = createHarness({
      confirmed: true,
      notify: (notification) => notifications.push(notification),
      fetch: async () =>
        new Response(
          [
            'event: response.output_text.delta\ndata: {"delta":"private response text"}',
            'event: response.completed\ndata: {"response":"private response text"}',
            "",
          ].join("\n\n"),
          { headers: { "content-type": "text/event-stream" } },
        ),
    });
    const sender = {
      id: 74,
      isDestroyed: () => false,
      send: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:notification",
          message: "private request text",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
        },
      ),
    ).resolves.toBeUndefined();

    expect(notifications).toEqual([
      {
        title: "Doolittle is ready",
        body: "Your response is ready.",
      },
    ]);
    expect(JSON.stringify(notifications)).not.toContain("private");
    harness.dispose();
  });

  it("treats a failed chat response as terminal and only notifies for attention", async () => {
    const events: Array<{ requestId: string; event: string; data: unknown }> =
      [];
    const notifications: Array<{ title: string; body: string }> = [];
    const harness = createHarness({
      confirmed: true,
      notify: (notification) => notifications.push(notification),
      fetch: async () =>
        new Response(
          'event: response.failed\ndata: {"message":"The response could not be completed. Please try again."}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    });
    const sender = {
      id: 741,
      isDestroyed: () => false,
      send: (_channel: string, event: (typeof events)[number]) =>
        events.push(event),
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:failed-terminal",
          message: "stream request",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
        },
      ),
    ).resolves.toBeUndefined();

    expect(events).toEqual([
      {
        requestId: "chat:failed-terminal",
        event: "response.failed",
        data: {
          message: "The response could not be completed. Please try again.",
        },
      },
    ]);
    expect(notifications).toEqual([
      {
        title: "Doolittle needs attention",
        body: "A response stopped with an error.",
      },
    ]);
    harness.dispose();
  });

  it("forwards only the first of duplicate failed chat terminal events", async () => {
    const events: Array<{ requestId: string; event: string; data: unknown }> =
      [];
    const notifications: Array<{ title: string; body: string }> = [];
    const harness = createHarness({
      confirmed: true,
      notify: (notification) => notifications.push(notification),
      fetch: async () =>
        new Response(
          [
            'event: response.failed\ndata: {"message":"first failure"}',
            'event: response.failed\ndata: {"message":"duplicate failure"}',
            "",
          ].join("\n\n"),
          { headers: { "content-type": "text/event-stream" } },
        ),
    });
    const sender = {
      id: 742,
      isDestroyed: () => false,
      send: (_channel: string, event: (typeof events)[number]) =>
        events.push(event),
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:duplicate-failed-terminal",
          message: "stream request",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
        },
      ),
    ).resolves.toBeUndefined();

    expect(events).toEqual([
      {
        requestId: "chat:duplicate-failed-terminal",
        event: "response.failed",
        data: { message: "first failure" },
      },
    ]);
    expect(notifications).toEqual([
      {
        title: "Doolittle needs attention",
        body: "A response stopped with an error.",
      },
    ]);
    harness.dispose();
  });

  it("does not turn a failed chat terminal event into completion", async () => {
    const events: Array<{ requestId: string; event: string; data: unknown }> =
      [];
    const notifications: Array<{ title: string; body: string }> = [];
    const harness = createHarness({
      confirmed: true,
      notify: (notification) => notifications.push(notification),
      fetch: async () =>
        new Response(
          [
            'event: response.failed\ndata: {"message":"turn failed"}',
            'event: response.completed\ndata: {"response":"incorrectly complete"}',
            "",
          ].join("\n\n"),
          { headers: { "content-type": "text/event-stream" } },
        ),
    });
    const sender = {
      id: 743,
      isDestroyed: () => false,
      send: (_channel: string, event: (typeof events)[number]) =>
        events.push(event),
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:failed-then-completed",
          message: "stream request",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
        },
      ),
    ).resolves.toBeUndefined();

    expect(events).toEqual([
      {
        requestId: "chat:failed-then-completed",
        event: "response.failed",
        data: { message: "turn failed" },
      },
    ]);
    expect(notifications).toEqual([
      {
        title: "Doolittle needs attention",
        body: "A response stopped with an error.",
      },
    ]);
    harness.dispose();
  });

  it("does not emit another terminal event after a failed response read error", async () => {
    const events: Array<{ requestId: string; event: string; data: unknown }> =
      [];
    const notifications: Array<{ title: string; body: string }> = [];
    const encoder = new TextEncoder();
    const harness = createHarness({
      confirmed: true,
      notify: (notification) => notifications.push(notification),
      fetch: async () => {
        let readCount = 0;
        return {
          ok: true,
          body: {
            getReader: () => ({
              read: async () => {
                if (readCount++ === 0) {
                  return {
                    done: false,
                    value: encoder.encode(
                      'event: response.failed\ndata: {"message":"turn failed"}\n\n',
                    ),
                  };
                }
                throw new Error("late transport failure");
              },
            }),
          },
        } as unknown as Response;
      },
    });
    const sender = {
      id: 744,
      isDestroyed: () => false,
      send: (_channel: string, event: (typeof events)[number]) =>
        events.push(event),
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:failed-late-reader-error",
          message: "stream request",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
        },
      ),
    ).resolves.toBeUndefined();

    expect(events).toEqual([
      {
        requestId: "chat:failed-late-reader-error",
        event: "response.failed",
        data: { message: "turn failed" },
      },
    ]);
    expect(notifications).toEqual([
      {
        title: "Doolittle needs attention",
        body: "A response stopped with an error.",
      },
    ]);
    harness.dispose();
  });

  it("does not reconnect a durable event feed after explicit cancellation", async () => {
    const requests: string[] = [];
    let markInitialStreamRequested: () => void = () => undefined;
    const initialStreamRequested = new Promise<void>((resolve) => {
      markInitialStreamRequested = resolve;
    });
    const harness = createHarness({
      confirmed: true,
      durableFetch: async (input, init) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/chat/runs")) {
          return Response.json(
            { run_id: "chat:cancel-no-reconnect" },
            {
              status: 202,
            },
          );
        }
        if (url.endsWith("/cancel")) {
          expect(init?.method).toBe("POST");
          return Response.json({
            accepted: true,
            run: {
              runId: "chat:cancel-no-reconnect",
              sessionId: "desktop:room-1",
              status: "cancelled",
              terminalReason: "cancelled",
            },
          });
        }
        markInitialStreamRequested();
        return new Response(
          'event: response.output_text.delta\ndata: {"event_id":1,"delta":"partial"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const sender = {
      id: 745,
      isDestroyed: () => false,
      send: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
    };
    const start = harness.handlers.get("chat:start")?.(
      { sender },
      {
        requestId: "chat:cancel-no-reconnect",
        message: "stop this response",
        roomId: "desktop:room-1",
        workspacePath: "/workspace",
      },
    ) as Promise<unknown>;

    await initialStreamRequested;
    await expect(
      harness.handlers.get("chat:cancel")?.(
        { sender },
        "chat:cancel-no-reconnect",
      ),
    ).resolves.toBeUndefined();
    await expect(start).resolves.toBeUndefined();
    expect(requests.filter((url) => url.includes("/events?")).length).toBe(1);
    harness.dispose();
  });

  it("stops chat by cancelling the server run before closing the local stream", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let resolveChatResponse: ((response: Response) => void) | undefined;
    const harness = createHarness({
      confirmed: true,
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        if (String(input).endsWith("/chat")) {
          return new Promise<Response>((resolve) => {
            resolveChatResponse = resolve;
          });
        }
        return new Response(
          JSON.stringify({
            accepted: true,
            run: {
              runId: "chat:server-stop",
              sessionId: "desktop:room-1",
              status: "cancelled",
              terminalReason: "cancelled",
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const emitted: Array<{ channel: string; payload: unknown }> = [];
    const sender = {
      id: 76,
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) =>
        emitted.push({ channel, payload }),
      once: () => undefined,
      removeListener: () => undefined,
    };
    const start = harness.handlers.get("chat:start")?.(
      { sender },
      {
        requestId: "chat:server-stop",
        message: "Stop the provider turn",
        roomId: "desktop:room-1",
        workspacePath: "/workspace",
      },
    );
    await Promise.resolve();

    await expect(
      harness.handlers.get("chat:cancel")?.({ sender }, "chat:server-stop"),
    ).resolves.toBeUndefined();
    expect(requests).toContainEqual({
      url: "http://127.0.0.1:4555/chat/runs/chat%3Aserver-stop/cancel",
      init: expect.objectContaining({ method: "POST" }),
    });
    expect(emitted).toContainEqual({
      channel: "chat:event",
      payload: {
        requestId: "chat:server-stop",
        event: "agent.run",
        data: {
          type: "cancelled",
          sessionId: "desktop:room-1",
          run: expect.objectContaining({ status: "cancelled" }),
        },
      },
    });

    resolveChatResponse?.(new Response(""));
    await expect(start).resolves.toBeUndefined();
    harness.dispose();
  });

  it("keeps a local chat active after failed cancellation and permits retry", async () => {
    let chatSignal: AbortSignal | undefined;
    let chatStarts = 0;
    let cancelCalls = 0;
    const harness = createHarness({
      confirmed: true,
      fetch: async (input, init) => {
        if (String(input).endsWith("/chat")) {
          chatStarts += 1;
          if (chatStarts === 2) {
            return new Response(
              `event: response.completed
data: {"response":"retried"}

`,
              { headers: { "content-type": "text/event-stream" } },
            );
          }
          return await new Promise<Response>((_resolve, reject) => {
            chatSignal = init?.signal ?? undefined;
            chatSignal?.addEventListener(
              "abort",
              () => reject(chatSignal?.reason),
              { once: true },
            );
          });
        }
        cancelCalls += 1;
        return cancelCalls === 1
          ? new Response("runtime cancellation failed", { status: 503 })
          : Response.json({ accepted: true });
      },
    });
    const sender = {
      id: 77,
      isDestroyed: () => false,
      send: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
    };
    const request = {
      requestId: "chat:cancel-fallback",
      message: "Stop this local stream",
      roomId: "desktop:room-1",
      workspacePath: "/workspace",
    };
    const start = harness.handlers.get("chat:start")?.(
      { sender },
      request,
    ) as Promise<unknown>;
    await vi.waitFor(() => expect(chatSignal).toBeDefined());

    await expect(
      harness.handlers.get("chat:cancel")?.({ sender }, "chat:cancel-fallback"),
    ).rejects.toThrow("runtime cancellation failed");
    expect(chatSignal?.aborted).toBe(false);
    await expect(
      harness.handlers.get("chat:start")?.({ sender }, request),
    ).rejects.toThrow(/already running/i);
    await expect(
      harness.handlers.get("chat:cancel")?.({ sender }, "chat:cancel-fallback"),
    ).resolves.toBeUndefined();
    expect(chatSignal?.aborted).toBe(true);
    await expect(start).resolves.toBeUndefined();

    // Only the acknowledged cancellation releases the active ID for retry.
    await expect(
      harness.handlers.get("chat:start")?.({ sender }, request),
    ).resolves.toBeUndefined();
    expect(chatStarts).toBe(2);
    expect(cancelCalls).toBe(2);
    harness.dispose();
  });

  it("does not fail a completed chat when the operating system rejects a notification", async () => {
    const harness = createHarness({
      confirmed: true,
      notify: () => {
        throw new Error("notifications unavailable");
      },
      fetch: async () =>
        new Response(
          'event: response.completed\ndata: {"response":"finished"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    });
    const sender = {
      id: 75,
      isDestroyed: () => false,
      send: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:notification-unavailable",
          message: "Finish this task",
          roomId: "desktop:room-1",
          workspacePath: "/workspace",
        },
      ),
    ).resolves.toBeUndefined();
    harness.dispose();
  });

  it("forwards a confirmed terminal stream as renderer events", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const notifications: Array<{ title: string; body: string }> = [];
    const harness = createHarness({
      confirmed: true,
      notify: (notification) => notifications.push(notification),
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(
          [
            'event: terminal.started\ndata: {"runId":"run-1"}',
            'event: terminal.stdout\ndata: {"runId":"run-1","chunk":"ok"}',
            'event: terminal.completed\ndata: {"runId":"run-1","result":{"exitCode":0}}',
            "",
          ].join("\n\n"),
          {
            headers: { "content-type": "text/event-stream" },
          },
        );
      },
    });
    const sent: Array<{ channel: string; payload: unknown }> = [];
    const destroyedListeners = new Set<() => void>();
    const sender = {
      id: 42,
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) =>
        sent.push({ channel, payload }),
      once: (_event: string, listener: () => void) =>
        destroyedListeners.add(listener),
      removeListener: (_event: string, listener: () => void) =>
        destroyedListeners.delete(listener),
    };

    const handler = harness.handlers.get("terminal:stream-start");
    await expect(
      handler?.(
        { sender },
        {
          requestId: "terminal:run-1",
          command: " bun test ",
          timeoutMs: 12_000,
        },
      ),
    ).resolves.toBeUndefined();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("http://127.0.0.1:4555/terminal/run/stream");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      command: "bun test",
      timeoutMs: 12_000,
    });
    expect(sent.map((entry) => entry.payload)).toEqual([
      {
        requestId: "terminal:run-1",
        event: "terminal.started",
        data: { runId: "run-1" },
      },
      {
        requestId: "terminal:run-1",
        event: "terminal.stdout",
        data: { runId: "run-1", chunk: "ok" },
      },
      {
        requestId: "terminal:run-1",
        event: "terminal.completed",
        data: { runId: "run-1", result: { exitCode: 0 } },
      },
    ]);
    expect(destroyedListeners.size).toBe(0);
    expect(notifications).toEqual([
      {
        title: "Command complete",
        body: "Your terminal task finished in Doolittle.",
      },
    ]);
    harness.dispose();
  });

  it("opens an empty interactive PTY without a redundant confirmation", async () => {
    const sessionId = "62df6968-19be-4ea6-b7a1-479a57fa3b7c";
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const session = {
      id: sessionId,
      state: "running",
      cwd: "/workspace",
      shell: "zsh",
      cols: 100,
      rows: 30,
      startedAt: "2026-07-27T00:00:00.000Z",
      pty: true,
      supportsResize: true,
      outputBytes: 0,
    };
    const terminalBackend = {
      getState: () => ({ phase: "ready", url: "http://127.0.0.1:4555" }),
    };
    const bots = {
      get: () => ({
        id: "lead-agent",
        isDefault: true,
        permissions: { allowMutation: true },
      }),
      ensureConversationOwner: vi.fn(async () => ({
        botId: "lead-agent",
        sessionId: "conversation-1",
      })),
      assertConversationOwner: vi.fn(() => ({
        botId: "lead-agent",
        sessionId: "conversation-1",
      })),
      assertAcpWorkspace: vi.fn(() => "/workspace"),
      backendFor: async () => terminalBackend,
      readyBackendFor: () => terminalBackend,
    } as unknown as BotProcessRegistry;
    const harness = createHarness({
      confirmed: false,
      bots,
      fetch: async (input, init) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.includes("/terminal/session/output")) {
          return Response.json({
            session,
            chunks: [{ cursor: 1, data: "ready" }],
            nextCursor: 1,
            truncatedBeforeCursor: false,
          });
        }
        return Response.json({ session });
      },
    });

    await expect(
      harness.handlers.get("terminal:session-start")?.(
        { sender: { id: 1 } },
        {
          requestId: terminalStartRequestId,
          originConversationId: "conversation-1",
          workspacePath: "/workspace",
          cols: 100,
          rows: 30,
        },
      ),
    ).resolves.toEqual({ status: "started", session });
    await harness.handlers.get("terminal:session-input")?.(
      {},
      { sessionId, data: "bun test\n" },
    );
    await harness.handlers.get("terminal:session-resize")?.(
      {},
      { sessionId, cols: 120, rows: 40 },
    );
    await harness.handlers.get("terminal:session-interrupt")?.({}, sessionId);
    await harness.handlers.get("terminal:session-close")?.({}, sessionId);
    const outputHandler = harness.handlers.get(
      "terminal:session-output",
    ) as unknown as (
      event: unknown,
      id: string,
      cursor: number,
    ) => Promise<unknown>;
    await expect(outputHandler({}, sessionId, 0)).resolves.toEqual({
      status: "available",
      output: {
        session,
        chunks: [{ cursor: 1, data: "ready" }],
        nextCursor: 1,
        truncatedBeforeCursor: false,
      },
    });

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/terminal/session/start",
      "/terminal/session/input",
      "/terminal/session/resize",
      "/terminal/session/interrupt",
      "/terminal/session/close",
      "/terminal/session/output",
    ]);
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      sessionId,
      data: "bun test\n",
    });
    expect(harness.confirmations).toHaveLength(0);
    harness.dispose();
  });

  it("binds an interactive PTY to its named bot and never sends its input to the lead runtime", async () => {
    const sessionId = "62df6968-19be-4ea6-b7a1-479a57fa3b7c";
    const requests: string[] = [];
    let ready = true;
    const terminalBackend = {
      getState: () => ({ phase: "ready", url: "http://127.0.0.1:4666" }),
    };
    const bots = {
      get: (id: string) => {
        if (id !== "bot-a") throw new Error("Bot not found.");
        return { id, isDefault: false, permissions: { allowMutation: true } };
      },
      backendFor: async (id: string) => {
        if (id !== "bot-a") throw new Error("Bot not found.");
        return terminalBackend;
      },
      readyBackendFor: (id: string) =>
        id === "bot-a" && ready ? terminalBackend : null,
      ensureConversationOwner: vi.fn(async () => ({
        botId: "bot-a",
        sessionId: "conversation-a",
      })),
      assertConversationOwner: vi.fn(() => ({
        botId: "bot-a",
        sessionId: "conversation-a",
      })),
      assertAcpWorkspace: vi.fn(() => "/workspace"),
    } as unknown as BotProcessRegistry;
    const session = {
      id: sessionId,
      state: "running",
      cwd: "/workspace",
      shell: "zsh",
      cols: 100,
      rows: 30,
      startedAt: "2026-07-27T00:00:00.000Z",
      pty: true,
      supportsResize: true,
      outputBytes: 0,
    };
    const harness = createHarness({
      confirmed: false,
      bots,
      fetch: async (input) => {
        requests.push(String(input));
        return Response.json({ session });
      },
    });
    await harness.handlers.get("terminal:session-start")?.(
      { sender: { id: 1 } },
      {
        requestId: terminalStartRequestId,
        botId: "bot-a",
        originConversationId: "conversation-a",
        workspacePath: "/workspace",
        cols: 100,
        rows: 30,
      },
    );
    await expect(
      harness.handlers.get("terminal:session-input")?.(
        {},
        { sessionId, data: "echo private\n" },
      ),
    ).rejects.toThrow(/another bot|unavailable/iu);
    await harness.handlers.get("terminal:session-input")?.(
      {},
      { botId: "bot-a", sessionId, data: "echo private\n" },
    );
    ready = false;
    const output = harness.handlers.get(
      "terminal:session-output",
    ) as unknown as (
      event: unknown,
      id: string,
      cursor: number,
      botId: string,
    ) => Promise<unknown>;
    await expect(output({}, sessionId, 0, "bot-a")).resolves.toMatchObject({
      status: "unconfirmed",
      retryable: false,
    });
    expect(requests).toEqual([
      "http://127.0.0.1:4666/terminal/session/start",
      "http://127.0.0.1:4666/terminal/session/input",
    ]);
    harness.dispose();
  });

  it("rejects malformed interactive terminal responses at the IPC boundary", async () => {
    const terminalBackend = {
      getState: () => ({ phase: "ready", url: "http://127.0.0.1:4555" }),
    };
    const bots = {
      get: () => ({
        id: "lead-agent",
        isDefault: true,
        permissions: { allowMutation: true },
      }),
      ensureConversationOwner: vi.fn(async () => ({
        botId: "lead-agent",
        sessionId: "conversation-1",
      })),
      assertAcpWorkspace: vi.fn(() => "/workspace"),
      backendFor: async () => terminalBackend,
      readyBackendFor: () => terminalBackend,
    } as unknown as BotProcessRegistry;
    const harness = createHarness({
      confirmed: true,
      bots,
      fetch: async () =>
        Response.json({
          session: {
            id: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
            state: "compromised",
          },
        }),
    });

    await expect(
      harness.handlers.get("terminal:session-start")?.(
        { sender: { id: 1 } },
        {
          requestId: terminalStartRequestId,
          originConversationId: "conversation-1",
          workspacePath: "/workspace",
          cols: 100,
          rows: 30,
        },
      ),
    ).resolves.toMatchObject({
      status: "unconfirmed",
      requestId: terminalStartRequestId,
      retryable: false,
    });
    harness.dispose();
  });

  it("reuses one creation identity after lost receipts and rejects conflicting retries", async () => {
    const session = {
      id: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
      state: "running",
      cwd: "/workspace",
      shell: "zsh",
      cols: 100,
      rows: 30,
      startedAt: "2026-07-27T00:00:00.000Z",
      pty: true,
      supportsResize: true,
      outputBytes: 0,
    };
    const terminalBackend = {
      getState: () => ({ phase: "ready", url: "http://127.0.0.1:4555" }),
    };
    const bots = {
      get: () => ({
        id: "lead-agent",
        isDefault: true,
        permissions: { allowMutation: true },
      }),
      ensureConversationOwner: vi.fn(async () => ({
        botId: "lead-agent",
        sessionId: "conversation-1",
      })),
      assertAcpWorkspace: vi.fn(() => "/workspace"),
      backendFor: vi.fn(async () => terminalBackend),
      readyBackendFor: vi.fn(() => terminalBackend),
    } as unknown as BotProcessRegistry;
    const creationIds: string[] = [];
    const harness = createHarness({
      confirmed: false,
      bots,
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { creationId: string };
        creationIds.push(body.creationId);
        if (creationIds.length < 3) {
          throw new TypeError("fetch failed", {
            cause: Object.assign(new Error("socket reset"), {
              code: "ECONNRESET",
            }),
          });
        }
        return Response.json({ session });
      },
    });
    const request = {
      requestId: terminalStartRequestId,
      originConversationId: "conversation-1",
      workspacePath: "/workspace",
      cols: 100,
      rows: 30,
    };
    await expect(
      harness.handlers.get("terminal:session-start")?.({}, request),
    ).resolves.toMatchObject({
      status: "unconfirmed",
      requestId: terminalStartRequestId,
      retryable: true,
    });
    await expect(
      harness.handlers.get("terminal:session-start")?.({}, request),
    ).resolves.toEqual({
      status: "started",
      session,
    });
    expect(creationIds).toEqual(Array(3).fill(terminalStartRequestId));
    await expect(
      harness.handlers.get("terminal:session-start")?.(
        {},
        { ...request, cols: 101 },
      ),
    ).rejects.toThrow(/identity conflicts/iu);
    expect(creationIds).toHaveLength(3);
    const expiredRequestId = `${Date.now() - 11 * 60_000}.62df6968-19be-4ea6-b7a1-479a57fa3b7c`;
    await expect(
      harness.handlers.get("terminal:session-start")?.(
        {},
        { ...request, requestId: expiredRequestId },
      ),
    ).resolves.toMatchObject({ status: "unconfirmed", retryable: false });
    expect(
      (bots.backendFor as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(1);
    expect(creationIds).toHaveLength(3);
    harness.dispose();
  });

  it("never reactivates a stopped named bot after a pre-POST identity failure", async () => {
    const session = {
      id: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
      state: "running",
      cwd: "/workspace",
      shell: "zsh",
      cols: 100,
      rows: 30,
      startedAt: "2026-07-27T00:00:00.000Z",
      pty: true,
      supportsResize: true,
      outputBytes: 0,
    };
    const terminalBackend = {
      getState: () => ({ phase: "ready", url: "http://127.0.0.1:4555" }),
    };
    let ready = false;
    const backendFor = vi.fn(async () => {
      ready = true;
      return terminalBackend;
    });
    let identityCalls = 0;
    const bots = {
      get: () => ({
        id: "bot-a",
        isDefault: false,
        permissions: { allowMutation: true },
      }),
      ensureConversationOwner: vi.fn(async () => ({
        botId: "bot-a",
        sessionId: "conversation-a",
      })),
      assertAcpWorkspace: vi.fn(() => "/workspace"),
      backendFor,
      readyBackendFor: () => (ready ? terminalBackend : null),
    } as unknown as BotProcessRegistry;
    const posts = vi.fn(async () => Response.json({ session }));
    const harness = createHarness({
      confirmed: false,
      bots,
      fetch: posts,
      runtimeProcessId: () => {
        identityCalls += 1;
        if (identityCalls === 1) throw new Error("Identity unavailable.");
        return 1234;
      },
    });
    const request = {
      botId: "bot-a",
      requestId: terminalStartRequestId,
      originConversationId: "conversation-a",
      workspacePath: "/workspace",
      cols: 100,
      rows: 30,
    };
    await expect(
      harness.handlers.get("terminal:session-start")?.({}, request),
    ).resolves.toMatchObject({
      status: "unconfirmed",
      retryable: false,
    });
    expect(posts).not.toHaveBeenCalled();
    ready = false; // Stop work after identity failed before the first POST.
    await expect(
      harness.handlers.get("terminal:session-start")?.({}, request),
    ).resolves.toMatchObject({ status: "unconfirmed", retryable: false });
    expect(backendFor).toHaveBeenCalledTimes(1);
    expect(posts).not.toHaveBeenCalled();
    ready = true; // An independently running bot can safely reconcile.
    await expect(
      harness.handlers.get("terminal:session-start")?.(
        {},
        { ...request, reconcileOnly: true },
      ),
    ).resolves.toEqual({
      status: "started",
      session,
    });
    expect(backendFor).toHaveBeenCalledTimes(1);
    expect(posts).toHaveBeenCalledTimes(1);
    harness.dispose();
  });

  it("never activates a named bot for a restored pending start absent from the native map", async () => {
    const backendFor = vi.fn(async () => {
      throw new Error("A restored pending request must not activate a bot.");
    });
    const bots = {
      get: () => ({
        id: "bot-a",
        isDefault: false,
        permissions: { allowMutation: true },
      }),
      ensureConversationOwner: vi.fn(async () => ({
        botId: "bot-a",
        sessionId: "conversation-a",
      })),
      assertAcpWorkspace: vi.fn(() => "/workspace"),
      backendFor,
      readyBackendFor: vi.fn(() => null),
    } as unknown as BotProcessRegistry;
    const posts = vi.fn(async () => Response.json({ session: {} }));
    const harness = createHarness({ confirmed: false, bots, fetch: posts });
    await expect(
      harness.handlers.get("terminal:session-start")?.(
        {},
        {
          botId: "bot-a",
          requestId: terminalStartRequestId,
          originConversationId: "conversation-a",
          workspacePath: "/workspace",
          cols: 100,
          rows: 30,
          reconcileOnly: true,
        },
      ),
    ).resolves.toMatchObject({ status: "unconfirmed", retryable: false });
    expect(backendFor).not.toHaveBeenCalled();
    expect(posts).not.toHaveBeenCalled();
    harness.dispose();
  });

  it("distinguishes proven terminal absence from generic 404 and socket uncertainty", async () => {
    const session = {
      id: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
      state: "running",
      cwd: "/workspace",
      shell: "zsh",
      cols: 100,
      rows: 30,
      startedAt: "2026-07-27T00:00:00.000Z",
      pty: true,
      supportsResize: true,
      outputBytes: 0,
    };
    const terminalBackend = {
      getState: () => ({ phase: "ready", url: "http://127.0.0.1:4555" }),
    };
    const bots = {
      get: () => ({
        id: "lead-agent",
        isDefault: true,
        permissions: { allowMutation: true },
      }),
      ensureConversationOwner: vi.fn(async () => ({
        botId: "lead-agent",
        sessionId: "conversation-1",
      })),
      assertConversationOwner: vi.fn(() => ({
        botId: "lead-agent",
        sessionId: "conversation-1",
      })),
      assertAcpWorkspace: vi.fn(() => "/workspace"),
      backendFor: async () => terminalBackend,
      readyBackendFor: () => terminalBackend,
    } as unknown as BotProcessRegistry;
    let outputCalls = 0;
    const runtimeInstanceId = "62df6968-19be-4ea6-b7a1-479a57fa3b7c";
    const runtimeProcessId = vi.fn(() => 1234);
    const harness = createHarness({
      confirmed: false,
      bots,
      runtimeProcessId,
      runtimeInstanceId: () => runtimeInstanceId,
      fetch: async (input) => {
        if (!String(input).includes("/terminal/session/output"))
          return Response.json({ session });
        outputCalls += 1;
        if (outputCalls === 1) {
          throw new TypeError("fetch failed", {
            cause: Object.assign(new Error("socket reset"), {
              code: "ECONNRESET",
            }),
          });
        }
        if (outputCalls === 2)
          return Response.json({ error: "Not found" }, { status: 404 });
        if (outputCalls === 5)
          return Response.json({
            session,
            chunks: [],
            nextCursor: 0,
            truncatedBeforeCursor: false,
            runtimeInstanceId: "88c9a480-6578-440b-9289-922d1cb9a4f4",
          });
        return Response.json(
          {
            code: "terminal-session-not-found",
            error: "Interactive terminal session was not found.",
            ...(outputCalls === 4
              ? { runtimeInstanceId: "88c9a480-6578-440b-9289-922d1cb9a4f4" }
              : {}),
          },
          { status: 404 },
        );
      },
    });
    const request = {
      requestId: terminalStartRequestId,
      originConversationId: "conversation-1",
      workspacePath: "/workspace",
      cols: 100,
      rows: 30,
    };
    await harness.handlers.get("terminal:session-start")?.({}, request);
    const identityRequestsAfterStart = runtimeProcessId.mock.calls.length;
    const output = harness.handlers.get(
      "terminal:session-output",
    ) as unknown as (
      event: unknown,
      id: string,
      cursor: number,
    ) => Promise<unknown>;
    await expect(output({}, session.id, 0)).resolves.toMatchObject({
      status: "unconfirmed",
      retryable: true,
    });
    await expect(output({}, session.id, 0)).resolves.toMatchObject({
      status: "unconfirmed",
      retryable: false,
    });
    await expect(output({}, session.id, 0)).resolves.toEqual({
      status: "absent",
      sessionId: session.id,
    });
    await expect(output({}, session.id, 0)).resolves.toMatchObject({
      status: "unconfirmed",
      retryable: false,
    });
    await expect(output({}, session.id, 0)).resolves.toMatchObject({
      status: "unconfirmed",
      retryable: false,
    });
    expect(outputCalls).toBe(5);
    expect(runtimeProcessId).toHaveBeenCalledTimes(identityRequestsAfterStart);
    harness.dispose();
  });

  it("does not replay an uncertain creation into a different runtime generation", async () => {
    const terminalBackend = {
      getState: () => ({ phase: "ready", url: "http://127.0.0.1:4555" }),
    };
    const bots = {
      get: () => ({
        id: "lead-agent",
        isDefault: true,
        permissions: { allowMutation: true },
      }),
      ensureConversationOwner: vi.fn(async () => ({
        botId: "lead-agent",
        sessionId: "conversation-1",
      })),
      assertAcpWorkspace: vi.fn(() => "/workspace"),
      backendFor: vi.fn(async () => terminalBackend),
      readyBackendFor: vi.fn(() => terminalBackend),
    } as unknown as BotProcessRegistry;
    let instanceId = "62df6968-19be-4ea6-b7a1-479a57fa3b7c";
    let postCount = 0;
    const harness = createHarness({
      confirmed: false,
      bots,
      runtimeInstanceId: () => instanceId,
      fetch: async () => {
        postCount += 1;
        throw new TypeError("fetch failed", {
          cause: Object.assign(new Error("socket reset"), {
            code: "ECONNRESET",
          }),
        });
      },
    });
    const request = {
      requestId: terminalStartRequestId,
      originConversationId: "conversation-1",
      workspacePath: "/workspace",
      cols: 100,
      rows: 30,
    };
    await expect(
      harness.handlers.get("terminal:session-start")?.({}, request),
    ).resolves.toMatchObject({
      status: "unconfirmed",
      retryable: true,
    });
    expect(postCount).toBe(2);
    instanceId = "88c9a480-6578-440b-9289-922d1cb9a4f4";
    await expect(
      harness.handlers.get("terminal:session-start")?.({}, request),
    ).resolves.toMatchObject({
      status: "unconfirmed",
      retryable: false,
    });
    expect(postCount).toBe(2);
    harness.dispose();
  });

  it("cancels a terminal request while native confirmation is pending", async () => {
    let resolveConfirmation: (confirmed: boolean) => void = () => undefined;
    const confirmation = new Promise<boolean>((resolve) => {
      resolveConfirmation = resolve;
    });
    let fetches = 0;
    const harness = createHarness({
      confirmed: () => confirmation,
      fetch: async () => {
        fetches += 1;
        return new Response();
      },
    });
    const sent: Array<{ channel: string; payload: unknown }> = [];
    const destroyedListeners = new Set<() => void>();
    const sender = {
      id: 43,
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) =>
        sent.push({ channel, payload }),
      once: (_event: string, listener: () => void) =>
        destroyedListeners.add(listener),
      removeListener: (_event: string, listener: () => void) =>
        destroyedListeners.delete(listener),
    };

    const start = harness.handlers.get("terminal:stream-start");
    const cancel = harness.handlers.get("terminal:stream-cancel");
    const startPromise = start?.(
      { sender },
      {
        requestId: "terminal:pending",
        command: "bun test",
        timeoutMs: 12_000,
      },
    );
    await Promise.resolve();
    cancel?.({ sender }, "terminal:pending");
    resolveConfirmation(true);
    await startPromise;

    expect(fetches).toBe(0);
    expect(sent.map((entry) => entry.payload)).toEqual([
      {
        requestId: "terminal:pending",
        event: "terminal.cancelled",
        data: { reason: "Command stopped before it started." },
      },
    ]);
    expect(destroyedListeners.size).toBe(0);
    harness.dispose();
  });

  it("aborts an active terminal stream and forwards a cancellation receipt", async () => {
    let markFetchStarted: () => void = () => undefined;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    const harness = createHarness({
      confirmed: true,
      fetch: async (_input, init) => {
        markFetchStarted();
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      },
    });
    const sent: Array<{ channel: string; payload: unknown }> = [];
    const destroyedListeners = new Set<() => void>();
    const sender = {
      id: 44,
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) =>
        sent.push({ channel, payload }),
      once: (_event: string, listener: () => void) =>
        destroyedListeners.add(listener),
      removeListener: (_event: string, listener: () => void) =>
        destroyedListeners.delete(listener),
    };

    const start = harness.handlers.get("terminal:stream-start");
    const cancel = harness.handlers.get("terminal:stream-cancel");
    const startPromise = start?.(
      { sender },
      {
        requestId: "terminal:active",
        command: "bun test",
        timeoutMs: 12_000,
      },
    );
    await fetchStarted;
    cancel?.({ sender }, "terminal:active");
    await startPromise;

    expect(sent.map((entry) => entry.payload)).toEqual([
      {
        requestId: "terminal:active",
        event: "terminal.cancelled",
        data: { reason: "Command stopped by the operator." },
      },
    ]);
    expect(destroyedListeners.size).toBe(0);
    harness.dispose();
  });

  it("reports workspace conflicts without claiming a save", async () => {
    const harness = createHarness({
      confirmed: true,
      fetch: async () =>
        Response.json(
          {
            error:
              "File changed after it was opened. Reload it before saving your edits.",
          },
          { status: 409 },
        ),
    });

    const handler = harness.handlers.get("workspace:save-confirmed");
    await expect(
      handler?.(
        {},
        {
          path: "notes.txt",
          content: "after",
          expectedContent: "before",
        },
      ),
    ).resolves.toEqual({
      status: "conflict",
      message:
        "File changed after it was opened. Reload it before saving your edits.",
    });
    harness.dispose();
  });
});
