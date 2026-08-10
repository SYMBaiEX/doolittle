import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it } from "vitest";
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

describe("sensitive desktop actions", () => {
  function createHarness(options: {
    confirmed: boolean | (() => Promise<boolean>);
    fetch?: typeof fetch;
    notify?: (notification: { title: string; body: string }) => void;
    senderAuthorized?: boolean;
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
      subscribe: () => () => undefined,
    } as unknown as BackendManager;
    const dispose = registerIpc({
      ipcMain,
      backend,
      getMainWindow: () => null,
      authorizeSender: () => options.senderAuthorized ?? true,
      pickFiles: async () => ({ canceled: true, paths: [] }),
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
        fetch: options.fetch,
        notify: options.notify,
      },
    });
    return { handlers, removedChannels, confirmations, dispose };
  }

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
    await expect(
      handler?.(
        {},
        {
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
      validateInteractiveTerminalStartRequest({ cols: 120, rows: 40 }),
    ).toEqual({ cols: 120, rows: 40 });
    expect(() =>
      validateInteractiveTerminalStartRequest({ cols: 10, rows: 40 }),
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
          projectId: "project-1",
          attachmentIds: [attachmentId],
        },
      ),
    ).catch((error) => error);
    expect(result).toBeUndefined();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("http://127.0.0.1:4555/chat");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      message: "Review this file",
      roomId: "desktop:room-1",
      runId: "chat:attachment-1",
      userId: "desktop-user",
      source: "desktop",
      stream: true,
      projectId: "project-1",
      attachmentIds: [attachmentId],
    });
    await expect(
      handler?.(
        { sender: { ...sender, id: 73 } },
        {
          requestId: "chat:attachment-command",
          message: "/status",
          roomId: "desktop:room-1",
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
          projectId: "../outside",
        },
      ),
    ).rejects.toThrow(/project id/i);
    expect(requests).toHaveLength(1);
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
      },
    );
    await Promise.resolve();

    await expect(
      harness.handlers.get("chat:cancel")?.({ sender }, "chat:server-stop"),
    ).resolves.toBeUndefined();
    expect(requests[1]?.url).toBe(
      "http://127.0.0.1:4555/chat/runs/chat%3Aserver-stop/cancel",
    );
    expect(requests[1]?.init?.method).toBe("POST");
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
    const harness = createHarness({
      confirmed: false,
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
        {},
        { cols: 100, rows: 30 },
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
      session,
      chunks: [{ cursor: 1, data: "ready" }],
      nextCursor: 1,
      truncatedBeforeCursor: false,
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

  it("rejects malformed interactive terminal responses at the IPC boundary", async () => {
    const harness = createHarness({
      confirmed: true,
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
        {},
        { cols: 100, rows: 30 },
      ),
    ).rejects.toThrow(/invalid terminal session state/iu);
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
