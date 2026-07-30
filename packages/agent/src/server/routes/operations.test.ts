import { describe, expect, it } from "vitest";
import type { AppLogRecord } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";
import { handleOperationsRoutes } from "./operations";

function createContext(): AppContext {
  return {
    runtime: {},
    services: {
      logger: {
        list: () => [],
      },
      sessions: {
        listSessions: () => [],
        usage: () => {
          throw new Error("missing session");
        },
      },
      workspace: {
        read: (path: string) => (path === "notes.txt" ? "before" : ""),
        write: (path: string, content: string) => `${path}:${content}`,
      },
      delivery: {
        recent: (limit: number) => [{ id: `delivery:${limit}` }],
      },
      terminal: {
        recent: (limit: number) => [{ command: `history:${limit}` }],
        run: async (command: string) => ({ command, ok: true }),
        runStreamingLocal: async (
          command: string,
          callbacks?: {
            onStdout?: (chunk: string) => void;
            onStderr?: (chunk: string) => void;
          },
          timeoutMs?: number,
        ) => {
          callbacks?.onStdout?.("streamed output");
          return {
            id: "command-stream",
            command,
            backend: "local",
            cwd: "/workspace",
            timeoutMs,
            exitCode: 0,
            stdout: "streamed output",
            stderr: "",
            startedAt: "2026-07-27T00:00:00.000Z",
            completedAt: "2026-07-27T00:00:00.100Z",
          };
        },
      },
    },
  } as unknown as AppContext;
}

describe("handleOperationsRoutes", () => {
  it("returns research, deliveries, and terminal history payloads", async () => {
    const context = createContext();
    const research = await handleOperationsRoutes(
      context,
      new Request("http://localhost/runtime/research"),
      new URL("http://localhost/runtime/research"),
    );
    const deliveries = await handleOperationsRoutes(
      context,
      new Request("http://localhost/deliveries"),
      new URL("http://localhost/deliveries"),
    );
    const history = await handleOperationsRoutes(
      context,
      new Request("http://localhost/terminal/history"),
      new URL("http://localhost/terminal/history"),
    );

    expect(await research?.json()).toHaveProperty("research");
    await expect(deliveries?.json()).resolves.toEqual({
      deliveries: [{ id: "delivery:100" }],
    });
    await expect(history?.json()).resolves.toEqual({
      commands: [{ command: "history:25" }],
    });
  });

  it("validates workspace writes and terminal commands", async () => {
    const invalidWrite = await handleOperationsRoutes(
      createContext(),
      new Request("http://localhost/workspace/write", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/workspace/write"),
    );
    const invalidRun = await handleOperationsRoutes(
      createContext(),
      new Request("http://localhost/terminal/run", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/terminal/run"),
    );

    expect(invalidWrite?.status).toBe(400);
    await expect(invalidWrite?.json()).resolves.toEqual({
      error: "path, content, and expectedContent are required",
    });
    expect(invalidRun?.status).toBe(400);
    await expect(invalidRun?.json()).resolves.toEqual({
      error: "command is required",
    });
  });

  it("writes workspace files and runs commands", async () => {
    const context = createContext();
    const write = await handleOperationsRoutes(
      context,
      new Request("http://localhost/workspace/write", {
        method: "POST",
        body: JSON.stringify({
          path: "notes.txt",
          content: "hello",
          expectedContent: "before",
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/workspace/write"),
    );
    const run = await handleOperationsRoutes(
      context,
      new Request("http://localhost/terminal/run", {
        method: "POST",
        body: JSON.stringify({ command: "pwd" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/terminal/run"),
    );

    await expect(write?.json()).resolves.toEqual({
      path: "notes.txt:hello",
    });
    await expect(run?.json()).resolves.toEqual({
      result: { command: "pwd", ok: true },
    });
  });

  it("adapts terminal runs to the official Eliza SDK capture contract", async () => {
    const context = createContext();
    context.services.terminal.run = async (command, timeoutMs) => ({
      id: "command-sdk",
      command,
      backend: "local",
      cwd: "/workspace",
      timeoutMs,
      timedOut: false,
      durationMs: 12,
      exitCode: 0,
      stdout: "/workspace\n",
      stderr: "",
      startedAt: "2026-07-30T00:00:00.000Z",
      completedAt: "2026-07-30T00:00:00.012Z",
    });

    const response = await handleOperationsRoutes(
      context,
      new Request("http://localhost/api/terminal/run", {
        method: "POST",
        body: JSON.stringify({
          command: "pwd",
          clientId: "runtime-terminal-action",
          captureOutput: true,
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/api/terminal/run"),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      ok: true,
      runId: "command-sdk",
      command: "pwd",
      exitCode: 0,
      stdout: "/workspace\n",
      stderr: "",
      timedOut: false,
      maxDurationMs: 30_000,
      durationMs: 12,
      cwd: "/workspace",
    });
  });

  it("enforces the SDK terminal token and single-line command contract", async () => {
    const previousToken = process.env.ELIZA_TERMINAL_RUN_TOKEN;
    process.env.ELIZA_TERMINAL_RUN_TOKEN = "terminal-secret";
    try {
      const post = (
        command: string,
        token?: string,
      ): Promise<Response | null> =>
        handleOperationsRoutes(
          createContext(),
          new Request("http://localhost/api/terminal/run", {
            method: "POST",
            body: JSON.stringify({
              command,
              clientId: "runtime-terminal-action",
              captureOutput: true,
              ...(token ? { terminalToken: token } : {}),
            }),
            headers: { "content-type": "application/json" },
          }),
          new URL("http://localhost/api/terminal/run"),
        );

      const missing = await post("pwd");
      const invalid = await post("pwd", "wrong");
      const multiline = await post("pwd\nwhoami", "terminal-secret");

      expect(missing?.status).toBe(401);
      await expect(missing?.json()).resolves.toEqual({
        error:
          "Missing terminal token. Provide X-Eliza-Terminal-Token header or terminalToken in request body.",
      });
      expect(invalid?.status).toBe(401);
      await expect(invalid?.json()).resolves.toEqual({
        error: "Invalid terminal token.",
      });
      expect(multiline?.status).toBe(400);
      await expect(multiline?.json()).resolves.toEqual({
        error: "Command must be a single line without control characters",
      });
    } finally {
      if (previousToken === undefined) {
        delete process.env.ELIZA_TERMINAL_RUN_TOKEN;
      } else {
        process.env.ELIZA_TERMINAL_RUN_TOKEN = previousToken;
      }
    }
  });

  it("routes bounded interactive terminal session operations", async () => {
    const context = createContext();
    const calls: Array<{ operation: string; value?: unknown }> = [];
    const session = {
      id: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
      state: "running" as const,
      cwd: "/workspace",
      shell: "zsh",
      cols: 100,
      rows: 30,
      startedAt: "2026-07-27T00:00:00.000Z",
      pty: true as const,
      supportsResize: true as const,
      outputBytes: 0,
    };
    context.services.terminal.startInteractiveSession = (value) => {
      calls.push({ operation: "start", value });
      return session;
    };
    context.services.terminal.writeInteractiveSession = (sessionId, data) => {
      calls.push({ operation: "input", value: { sessionId, data } });
      return session;
    };
    context.services.terminal.resizeInteractiveSession = (
      sessionId,
      cols,
      rows,
    ) => {
      calls.push({ operation: "resize", value: { sessionId, cols, rows } });
      return { ...session, cols, rows };
    };
    context.services.terminal.interruptInteractiveSession = (sessionId) => {
      calls.push({ operation: "interrupt", value: sessionId });
      return session;
    };
    context.services.terminal.closeInteractiveSession = (sessionId) => {
      calls.push({ operation: "close", value: sessionId });
      return { ...session, state: "closed" };
    };
    context.services.terminal.interactiveSessionOutput = (
      sessionId,
      cursor,
    ) => {
      calls.push({ operation: "output", value: { sessionId, cursor } });
      return {
        session,
        chunks: [{ cursor: 4, data: "ready" }],
        nextCursor: 4,
        truncatedBeforeCursor: false,
      };
    };

    const post = (pathname: string, body: Record<string, unknown>) =>
      handleOperationsRoutes(
        context,
        new Request(`http://localhost${pathname}`, {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
        new URL(`http://localhost${pathname}`),
      );
    const sessionId = session.id;
    expect(
      await (
        await post("/terminal/session/start", { cols: 100, rows: 30 })
      )?.json(),
    ).toEqual({ session });
    await post("/terminal/session/input", {
      sessionId,
      data: "bun test\n",
    });
    await post("/terminal/session/resize", {
      sessionId,
      cols: 120,
      rows: 40,
    });
    await post("/terminal/session/interrupt", { sessionId });
    await post("/terminal/session/close", { sessionId });
    const output = await handleOperationsRoutes(
      context,
      new Request(
        `http://localhost/terminal/session/output?sessionId=${sessionId}&cursor=3`,
      ),
      new URL(
        `http://localhost/terminal/session/output?sessionId=${sessionId}&cursor=3`,
      ),
    );
    await expect(output?.json()).resolves.toEqual({
      session,
      chunks: [{ cursor: 4, data: "ready" }],
      nextCursor: 4,
      truncatedBeforeCursor: false,
    });
    expect(calls).toEqual([
      { operation: "start", value: { cols: 100, rows: 30 } },
      { operation: "input", value: { sessionId, data: "bun test\n" } },
      { operation: "resize", value: { sessionId, cols: 120, rows: 40 } },
      { operation: "interrupt", value: sessionId },
      { operation: "close", value: sessionId },
      { operation: "output", value: { sessionId, cursor: 3 } },
    ]);
  });

  it("rejects a stale workspace save without writing", async () => {
    const context = createContext();
    let writes = 0;
    context.services.workspace.write = async () => {
      writes += 1;
      return "unexpected";
    };

    const response = await handleOperationsRoutes(
      context,
      new Request("http://localhost/workspace/write", {
        method: "POST",
        body: JSON.stringify({
          path: "notes.txt",
          content: "after",
          expectedContent: "stale",
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/workspace/write"),
    );

    expect(response?.status).toBe(409);
    expect(writes).toBe(0);
    await expect(response?.json()).resolves.toEqual({
      error:
        "File changed after it was opened. Reload it before saving your edits.",
      conflict: true,
    });
  });

  it("bounds terminal command timeouts and forwards a safe timeout", async () => {
    const context = createContext();
    const calls: Array<{ command: string; timeoutMs?: number }> = [];
    context.services.terminal.run = async (
      command: string,
      timeoutMs?: number,
    ) => {
      calls.push({ command, timeoutMs });
      return {
        id: "command-1",
        command,
        backend: "local",
        cwd: "/workspace",
        timeoutMs,
        exitCode: 0,
        stdout: "",
        stderr: "",
        startedAt: "2026-07-27T00:00:00.000Z",
        completedAt: "2026-07-27T00:00:00.100Z",
      };
    };

    const invalid = await handleOperationsRoutes(
      context,
      new Request("http://localhost/terminal/run", {
        method: "POST",
        body: JSON.stringify({ command: "pwd", timeoutMs: 120_001 }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/terminal/run"),
    );
    const valid = await handleOperationsRoutes(
      context,
      new Request("http://localhost/terminal/run", {
        method: "POST",
        body: JSON.stringify({ command: "pwd", timeoutMs: 5_000 }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/terminal/run"),
    );

    expect(invalid?.status).toBe(400);
    expect(calls).toEqual([{ command: "pwd", timeoutMs: 5_000 }]);
    await expect(valid?.json()).resolves.toEqual({
      result: {
        id: "command-1",
        command: "pwd",
        backend: "local",
        cwd: "/workspace",
        timeoutMs: 5_000,
        exitCode: 0,
        stdout: "",
        stderr: "",
        startedAt: "2026-07-27T00:00:00.000Z",
        completedAt: "2026-07-27T00:00:00.100Z",
      },
    });
  });

  it("streams terminal progress and a bounded completion record", async () => {
    const context = createContext();
    const calls: Array<{ command: string; timeoutMs?: number }> = [];
    context.services.terminal.runStreamingLocal = async (
      command: string,
      callbacks:
        | {
            onStdout?: (chunk: string) => void;
            onStderr?: (chunk: string) => void;
          }
        | undefined,
      timeoutMs?: number,
    ) => {
      calls.push({ command, timeoutMs });
      callbacks?.onStdout?.("first line\n");
      callbacks?.onStderr?.("warning\n");
      return {
        id: "command-stream",
        command,
        backend: "local",
        cwd: "/workspace",
        timeoutMs: timeoutMs ?? 30_000,
        exitCode: 0,
        stdout: "first line",
        stderr: "warning",
        startedAt: "2026-07-27T00:00:00.000Z",
        completedAt: "2026-07-27T00:00:00.100Z",
      };
    };

    const response = await handleOperationsRoutes(
      context,
      new Request("http://localhost/terminal/run/stream", {
        method: "POST",
        body: JSON.stringify({ command: " bun test ", timeoutMs: 5_000 }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/terminal/run/stream"),
    );
    const body = await response?.text();

    expect(response?.headers.get("content-type")).toContain(
      "text/event-stream",
    );
    expect(calls).toEqual([{ command: "bun test", timeoutMs: 5_000 }]);
    expect(body).toContain("event: terminal.started");
    expect(body).toContain('"command":"bun test"');
    expect(body).toContain("event: terminal.stdout");
    expect(body).toContain('"chunk":"first line\\n"');
    expect(body).toContain("event: terminal.stderr");
    expect(body).toContain("event: terminal.completed");
    expect(body).toContain('"id":"command-stream"');
  });

  it("propagates terminal stream cancellation and emits a cancelled receipt", async () => {
    const context = createContext();
    let receivedSignal: AbortSignal | undefined;
    context.services.terminal.runStreamingLocal = async (
      command: string,
      _callbacks,
      timeoutMs?: number,
      signal?: AbortSignal,
    ) => {
      receivedSignal = signal;
      await new Promise<void>((resolve) => {
        if (signal?.aborted) {
          resolve();
          return;
        }
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      return {
        id: "command-cancelled",
        command,
        backend: "local",
        cwd: "/workspace",
        timeoutMs: timeoutMs ?? 30_000,
        exitCode: 130,
        stdout: "partial output",
        stderr: "",
        startedAt: "2026-07-27T00:00:00.000Z",
        completedAt: "2026-07-27T00:00:00.100Z",
      };
    };

    const controller = new AbortController();
    const response = await handleOperationsRoutes(
      context,
      new Request("http://localhost/terminal/run/stream", {
        method: "POST",
        body: JSON.stringify({ command: "bun test", timeoutMs: 5_000 }),
        headers: { "content-type": "application/json" },
        signal: controller.signal,
      }),
      new URL("http://localhost/terminal/run/stream"),
    );
    controller.abort();
    const body = await response?.text();

    expect(receivedSignal?.aborted).toBe(true);
    expect(body).toContain("event: terminal.cancelled");
    expect(body).toContain('"id":"command-cancelled"');
    expect(body).not.toContain("event: terminal.completed");
  });

  it("returns bounded logs and applies level and query filters", async () => {
    let requestedLimit = 0;
    const records: AppLogRecord[] = Array.from(
      { length: 1_100 },
      (_, index) => ({
        at: `2026-07-26T00:00:${String(index % 60).padStart(2, "0")}Z`,
        level: index % 2 === 0 ? ("info" as const) : ("error" as const),
        scope: index === 1_099 ? "desktop" : "runtime",
        message: index === 1_099 ? "Desktop failed safely" : `record ${index}`,
        fields: index === 1_099 ? { operation: "desktop-start" } : undefined,
      }),
    );
    const context = createContext();
    context.services.logger.list = (limit: number) => {
      requestedLimit = limit;
      return records;
    };

    const response = await handleOperationsRoutes(
      context,
      new Request("http://localhost/logs?limit=5000&level=error&query=desktop"),
      new URL("http://localhost/logs?limit=5000&level=error&query=desktop"),
    );

    expect(requestedLimit).toBe(1000);
    await expect(response?.json()).resolves.toEqual({
      logs: [records[1_099]],
    });
  });

  it("uses safe log limits and rejects invalid levels", async () => {
    const requestedLimits: number[] = [];
    const context = createContext();
    context.services.logger.list = (limit: number) => {
      requestedLimits.push(limit);
      return Array.from({ length: 300 }, (_, index) => ({
        at: "2026-07-26T00:00:00Z",
        level: "info",
        scope: "test",
        message: `record ${index}`,
      }));
    };

    const defaultResponse = await handleOperationsRoutes(
      context,
      new Request("http://localhost/logs"),
      new URL("http://localhost/logs"),
    );
    const minimumResponse = await handleOperationsRoutes(
      context,
      new Request("http://localhost/logs?limit=-20"),
      new URL("http://localhost/logs?limit=-20"),
    );
    const invalidLevel = await handleOperationsRoutes(
      context,
      new Request("http://localhost/logs?level=verbose"),
      new URL("http://localhost/logs?level=verbose"),
    );

    expect(requestedLimits).toEqual([1000, 1000]);
    const defaultPayload = await defaultResponse?.json();
    const minimumPayload = await minimumResponse?.json();
    expect(defaultPayload.logs).toHaveLength(200);
    expect(minimumPayload.logs).toHaveLength(1);
    expect(invalidLevel?.status).toBe(400);
    await expect(invalidLevel?.json()).resolves.toEqual({
      error: "invalid log level",
    });
  });

  it("returns session-derived analytics despite an individual usage failure", async () => {
    const context = createContext();
    context.services.sessions.listSessions = (limit: number) => {
      expect(limit).toBe(1000);
      return [
        {
          sessionId: "session-1",
          title: "First",
          messageCount: 3,
          startedAt: "2026-07-25T08:00:00Z",
          endedAt: "2026-07-25T08:02:00Z",
          participants: ["user", "assistant"],
          preview: ["hello"],
        },
        {
          sessionId: "session-2",
          messageCount: 2,
          startedAt: "2026-07-26T09:00:00Z",
          endedAt: "2026-07-26T09:01:00Z",
          participants: ["user", "assistant"],
          preview: ["retry"],
        },
      ];
    };
    context.services.sessions.usage = (sessionId: string) => {
      if (sessionId === "session-2") {
        throw new Error("damaged usage row");
      }
      return {
        sessionId,
        title: "First",
        messageCount: 3,
        userMessages: 2,
        assistantMessages: 1,
        systemMessages: 0,
        startedAt: "2026-07-25T08:00:00Z",
        endedAt: "2026-07-25T08:02:00Z",
        characterCount: 80,
        estimatedTokens: 20,
        lastPreview: "done",
      };
    };

    const response = await handleOperationsRoutes(
      context,
      new Request("http://localhost/analytics"),
      new URL("http://localhost/analytics"),
    );
    const payload = await response?.json();

    expect(payload.totals).toEqual({
      sessions: 2,
      messages: 5,
      estimatedTokens: 20,
      userMessages: 2,
      assistantMessages: 1,
      systemMessages: 0,
    });
    expect(payload.recentSessions).toHaveLength(2);
    expect(payload.recentSessions[0].usage.estimatedTokens).toBe(20);
    expect(payload.recentSessions[1].usage).toBeNull();
    expect(payload.dailyActivity).toEqual([
      {
        date: "2026-07-25",
        sessions: 1,
        messages: 3,
        estimatedTokens: 20,
      },
      {
        date: "2026-07-26",
        sessions: 1,
        messages: 2,
        estimatedTokens: 0,
      },
    ]);
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleOperationsRoutes(
      createContext(),
      new Request("http://localhost/not-ops"),
      new URL("http://localhost/not-ops"),
    );

    expect(response).toBeNull();
  });
});
