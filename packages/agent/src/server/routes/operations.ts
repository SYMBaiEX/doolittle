import { randomUUID } from "node:crypto";
import type { AppContext } from "@/runtime/bootstrap";
import { getNativeResearchControlPlane } from "@/runtime/native/service-bridge/control-planes";
import { getEffectiveShellHistory } from "@/runtime/native/service-bridge/tooling";
import { sdkTerminalRunTokenError } from "@/server/auth";
import { json, streamSse } from "@/server/responses";

const MAX_WORKSPACE_FILE_BYTES = 1_000_000;
const MAX_WORKSPACE_PATH_LENGTH = 4_096;
const MAX_COMMAND_LENGTH = 4_096;
const MIN_COMMAND_TIMEOUT_MS = 1_000;
const MAX_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_TERMINAL_STREAM_BYTES = 2_000_000;
const MAX_SDK_TERMINAL_CAPTURE_BYTES = 128 * 1024;
const LOG_LEVELS = new Set([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);

type TerminalCommandInput =
  | {
      command: string;
      timeoutMs: number;
    }
  | {
      error: string;
      status: number;
    };

function parseTerminalCommandInput(
  body: Record<string, unknown>,
): TerminalCommandInput {
  const command = typeof body.command === "string" ? body.command.trim() : "";
  if (!command) {
    return { error: "command is required", status: 400 };
  }
  if (command.length > MAX_COMMAND_LENGTH || command.includes("\0")) {
    return {
      error: "command is too large or contains null bytes",
      status: 400,
    };
  }
  const timeoutMs =
    body.timeoutMs === undefined ? DEFAULT_COMMAND_TIMEOUT_MS : body.timeoutMs;
  if (
    typeof timeoutMs !== "number" ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < MIN_COMMAND_TIMEOUT_MS ||
    timeoutMs > MAX_COMMAND_TIMEOUT_MS
  ) {
    return {
      error: `timeoutMs must be an integer from ${MIN_COMMAND_TIMEOUT_MS} to ${MAX_COMMAND_TIMEOUT_MS}`,
      status: 400,
    };
  }
  return { command, timeoutMs };
}

function terminalSessionError(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  return json(
    { error: message },
    message.includes("was not found") ? 404 : 400,
  );
}

function terminalSessionId(body: Record<string, unknown>): string {
  return typeof body.sessionId === "string" ? body.sessionId : "";
}

function takeUtf8Prefix(value: string, maximumBytes: number): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maximumBytes) return value;
  return new TextDecoder().decode(bytes.slice(0, maximumBytes));
}

function boundedTerminalResult<T extends Record<string, unknown>>(result: T) {
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const stdoutBytes = new TextEncoder().encode(stdout).byteLength;
  const stderrBytes = new TextEncoder().encode(stderr).byteLength;
  const stdoutLimit = Math.min(stdoutBytes, MAX_TERMINAL_STREAM_BYTES);
  const stderrLimit = Math.max(0, MAX_TERMINAL_STREAM_BYTES - stdoutLimit);
  return {
    ...result,
    stdout: takeUtf8Prefix(stdout, stdoutLimit),
    stderr: takeUtf8Prefix(stderr, stderrLimit),
    outputTruncated:
      stdoutBytes + stderrBytes > MAX_TERMINAL_STREAM_BYTES || undefined,
  };
}

function sdkTerminalRunResult(
  result: Awaited<ReturnType<AppContext["services"]["terminal"]["run"]>>,
  timeoutMs: number,
) {
  const stdoutBytes = new TextEncoder().encode(result.stdout).byteLength;
  const stderrBytes = new TextEncoder().encode(result.stderr).byteLength;
  const stdoutLimit = Math.min(stdoutBytes, MAX_SDK_TERMINAL_CAPTURE_BYTES);
  const stderrLimit = Math.max(0, MAX_SDK_TERMINAL_CAPTURE_BYTES - stdoutLimit);
  return {
    ok: true,
    runId: result.id,
    command: result.command,
    exitCode: result.exitCode,
    stdout: takeUtf8Prefix(result.stdout, stdoutLimit),
    stderr: takeUtf8Prefix(result.stderr, stderrLimit),
    timedOut: result.timedOut === true || result.exitCode === 124,
    truncated:
      stdoutBytes + stderrBytes > MAX_SDK_TERMINAL_CAPTURE_BYTES || undefined,
    maxDurationMs: timeoutMs,
    durationMs: result.durationMs,
    cwd: result.cwd,
  };
}

function boundedInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(1, parsed));
}

function includesLogQuery(
  record: {
    scope: string;
    message: string;
    detail?: string;
    fields?: Record<string, unknown>;
  },
  query: string,
): boolean {
  const searchable = [
    record.scope,
    record.message,
    record.detail ?? "",
    record.fields ? JSON.stringify(record.fields) : "",
  ]
    .join(" ")
    .toLowerCase();
  return searchable.includes(query);
}

export async function handleOperationsRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/runtime/research") {
    return json({
      research: getNativeResearchControlPlane(context.runtime),
    });
  }

  if (request.method === "POST" && url.pathname === "/workspace/write") {
    const body = (await request.json()) as Record<string, unknown>;
    const path = typeof body.path === "string" ? body.path : "";
    if (
      !path ||
      path.length > MAX_WORKSPACE_PATH_LENGTH ||
      typeof body.content !== "string" ||
      typeof body.expectedContent !== "string"
    ) {
      return json(
        { error: "path, content, and expectedContent are required" },
        400,
      );
    }
    if (
      new TextEncoder().encode(body.content).byteLength >
        MAX_WORKSPACE_FILE_BYTES ||
      new TextEncoder().encode(body.expectedContent).byteLength >
        MAX_WORKSPACE_FILE_BYTES
    ) {
      return json({ error: "workspace file is too large" }, 413);
    }
    const currentContent = context.services.workspace.read(path);
    if (currentContent !== body.expectedContent) {
      return json(
        {
          error:
            "File changed after it was opened. Reload it before saving your edits.",
          conflict: true,
        },
        409,
      );
    }
    return json({
      path: await context.services.workspace.write(path, body.content),
    });
  }

  if (request.method === "GET" && url.pathname === "/deliveries") {
    return json({
      deliveries: context.services.delivery.recent(100),
    });
  }

  if (request.method === "GET" && url.pathname === "/logs") {
    const limit = boundedInteger(url.searchParams.get("limit"), 200, 1000);
    const level = url.searchParams.get("level")?.trim().toLowerCase();
    if (level && !LOG_LEVELS.has(level)) {
      return json({ error: "invalid log level" }, 400);
    }
    const query = url.searchParams.get("query")?.trim().toLowerCase() ?? "";
    const records = context.services.logger.list(1000);
    const logs = records
      .filter((record) => !level || record.level === level)
      .filter((record) => !query || includesLogQuery(record, query))
      .slice(-limit);
    return json({ logs });
  }

  if (request.method === "GET" && url.pathname === "/analytics") {
    const sessions = context.services.sessions.listSessions(1000);
    const usageBySession = sessions.map((session) => {
      try {
        return {
          session,
          usage: context.services.sessions.usage(session.sessionId),
        };
      } catch {
        return {
          session,
          usage: null,
        };
      }
    });
    const recentSessions = usageBySession.slice(0, 20).map((entry) => ({
      ...entry.session,
      usage: entry.usage,
    }));
    const totals = usageBySession.reduce(
      (result, entry) => {
        result.messages +=
          entry.usage?.messageCount ?? entry.session.messageCount;
        result.estimatedTokens += entry.usage?.estimatedTokens ?? 0;
        result.userMessages += entry.usage?.userMessages ?? 0;
        result.assistantMessages += entry.usage?.assistantMessages ?? 0;
        result.systemMessages += entry.usage?.systemMessages ?? 0;
        return result;
      },
      {
        sessions: sessions.length,
        messages: 0,
        estimatedTokens: 0,
        userMessages: 0,
        assistantMessages: 0,
        systemMessages: 0,
      },
    );
    const activityByDate = new Map<
      string,
      {
        date: string;
        sessions: number;
        messages: number;
        estimatedTokens: number;
      }
    >();
    for (const entry of usageBySession) {
      const timestamp =
        entry.usage?.endedAt ??
        entry.session.endedAt ??
        entry.usage?.startedAt ??
        entry.session.startedAt;
      const date = timestamp?.slice(0, 10);
      if (!date) {
        continue;
      }
      const activity = activityByDate.get(date) ?? {
        date,
        sessions: 0,
        messages: 0,
        estimatedTokens: 0,
      };
      activity.sessions += 1;
      activity.messages +=
        entry.usage?.messageCount ?? entry.session.messageCount;
      activity.estimatedTokens += entry.usage?.estimatedTokens ?? 0;
      activityByDate.set(date, activity);
    }
    const dailyActivity = [...activityByDate.values()]
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-30);
    return json({
      totals,
      recentSessions,
      dailyActivity,
    });
  }

  if (request.method === "GET" && url.pathname === "/terminal/history") {
    return json({
      commands: getEffectiveShellHistory(context.runtime, context.services, 25),
    });
  }

  if (request.method === "POST" && url.pathname === "/terminal/run") {
    const body = (await request.json()) as Record<string, unknown>;
    const input = parseTerminalCommandInput(body);
    if ("error" in input) {
      return json({ error: input.error }, input.status);
    }
    return json({
      result: await context.services.terminal.run(
        input.command,
        input.timeoutMs,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/api/terminal/run") {
    const body = (await request.json()) as Record<string, unknown>;
    const tokenError = sdkTerminalRunTokenError(request, body);
    if (tokenError) {
      return json({ error: tokenError.reason }, tokenError.status);
    }
    const input = parseTerminalCommandInput(body);
    if ("error" in input) {
      return json({ error: input.error }, input.status);
    }
    if (/[\r\n]/.test(input.command)) {
      return json(
        { error: "Command must be a single line without control characters" },
        400,
      );
    }

    const run = context.services.terminal.run(input.command, input.timeoutMs);
    if (body.captureOutput !== true) {
      void run.catch((error) => {
        context.services.logger.captureError(
          "sdk-terminal-background-run-failed",
          error,
          { command: input.command },
        );
      });
      return json({ ok: true });
    }
    return json(sdkTerminalRunResult(await run, input.timeoutMs));
  }

  if (request.method === "POST" && url.pathname === "/terminal/run/stream") {
    const body = (await request.json()) as Record<string, unknown>;
    const input = parseTerminalCommandInput(body);
    if ("error" in input) {
      return json({ error: input.error }, input.status);
    }

    const runId = randomUUID();
    return streamSse(async (emit) => {
      await emit("terminal.started", {
        runId,
        command: input.command,
        startedAt: new Date().toISOString(),
      });

      let streamedBytes = 0;
      let truncationEmitted = false;
      let emitQueue = Promise.resolve();
      const queueChunk = (event: "terminal.stdout" | "terminal.stderr") => {
        return (chunk: string) => {
          const remaining = MAX_TERMINAL_STREAM_BYTES - streamedBytes;
          if (remaining <= 0) {
            if (!truncationEmitted) {
              truncationEmitted = true;
              emitQueue = emitQueue.then(() =>
                emit("terminal.stderr", {
                  runId,
                  chunk:
                    "\n[Doolittle truncated live terminal output after 2 MB. The command continues running.]\n",
                  truncated: true,
                }),
              );
            }
            return;
          }
          const bounded = takeUtf8Prefix(chunk, remaining);
          streamedBytes += new TextEncoder().encode(bounded).byteLength;
          emitQueue = emitQueue.then(() =>
            emit(event, {
              runId,
              chunk: bounded,
            }),
          );
        };
      };

      const result = await context.services.terminal.runStreamingLocal(
        input.command,
        {
          onStdout: queueChunk("terminal.stdout"),
          onStderr: queueChunk("terminal.stderr"),
        },
        input.timeoutMs,
        request.signal,
      );
      await emitQueue;
      await emit(
        request.signal.aborted ? "terminal.cancelled" : "terminal.completed",
        {
          runId,
          result: boundedTerminalResult(
            result as unknown as Record<string, unknown>,
          ),
        },
      );
    });
  }

  if (request.method === "POST" && url.pathname === "/terminal/session/start") {
    const body = (await request.json()) as Record<string, unknown>;
    try {
      return json({
        session: context.services.terminal.startInteractiveSession({
          cols: typeof body.cols === "number" ? body.cols : undefined,
          rows: typeof body.rows === "number" ? body.rows : undefined,
        }),
      });
    } catch (error) {
      return terminalSessionError(error);
    }
  }

  if (request.method === "POST" && url.pathname === "/terminal/session/input") {
    const body = (await request.json()) as Record<string, unknown>;
    try {
      return json({
        session: context.services.terminal.writeInteractiveSession(
          terminalSessionId(body),
          typeof body.data === "string" ? body.data : "",
        ),
      });
    } catch (error) {
      return terminalSessionError(error);
    }
  }

  if (
    request.method === "POST" &&
    url.pathname === "/terminal/session/resize"
  ) {
    const body = (await request.json()) as Record<string, unknown>;
    try {
      return json({
        session: context.services.terminal.resizeInteractiveSession(
          terminalSessionId(body),
          typeof body.cols === "number" ? body.cols : 100,
          typeof body.rows === "number" ? body.rows : 30,
        ),
      });
    } catch (error) {
      return terminalSessionError(error);
    }
  }

  if (
    request.method === "POST" &&
    url.pathname === "/terminal/session/interrupt"
  ) {
    const body = (await request.json()) as Record<string, unknown>;
    try {
      return json({
        session: context.services.terminal.interruptInteractiveSession(
          terminalSessionId(body),
        ),
      });
    } catch (error) {
      return terminalSessionError(error);
    }
  }

  if (request.method === "POST" && url.pathname === "/terminal/session/close") {
    const body = (await request.json()) as Record<string, unknown>;
    try {
      return json({
        session: context.services.terminal.closeInteractiveSession(
          terminalSessionId(body),
        ),
      });
    } catch (error) {
      return terminalSessionError(error);
    }
  }

  if (request.method === "GET" && url.pathname === "/terminal/session/output") {
    try {
      const cursor = Number.parseInt(url.searchParams.get("cursor") ?? "0", 10);
      return json(
        context.services.terminal.interactiveSessionOutput(
          url.searchParams.get("sessionId") ?? "",
          Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0,
        ),
      );
    } catch (error) {
      return terminalSessionError(error);
    }
  }

  return null;
}
