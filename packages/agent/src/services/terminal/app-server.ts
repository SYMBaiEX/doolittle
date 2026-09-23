import { realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import type {
  InteractiveTerminalSessionManager,
  InteractiveTerminalSessionSnapshot,
} from "./session";

export interface AppServerSnapshot {
  session: InteractiveTerminalSessionSnapshot;
  status: "starting" | "ready" | "unhealthy" | "exited" | "stopped";
  url?: string;
  output: string;
}

export function localAppUrls(output: string): string[] {
  const matches =
    stripVTControlCharacters(output).match(/https?:\/\/[^\s<>"'`]+/giu) ?? [];
  return [
    ...new Set(
      matches.flatMap((match) => {
        try {
          const url = new URL(match.replace(/[),.;]+$/u, ""));
          const port = Number(
            url.port || (url.protocol === "https:" ? 443 : 80),
          );
          return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
            port >= 1 &&
            port <= 65535 &&
            !url.username &&
            !url.password
            ? [url.href]
            : [];
        } catch {
          return [];
        }
      }),
    ),
  ];
}

async function isHttpReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(1_000),
    });
    await response.body?.cancel();
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

/** Managed application lifetime is independent of its chat's SSE subscription. */
export class AppServerManager {
  private readonly owners = new Map<string, string>();
  private readonly startupAbortCleanup = new Map<string, () => void>();
  private readonly readyUrls = new Map<string, string>();

  constructor(
    private readonly terminal: InteractiveTerminalSessionManager,
    private readonly probe: (url: string) => Promise<boolean> = isHttpReady,
  ) {}

  /** Live managed sessions owned by a conversation, for safe agent handoffs. */
  listOwnedSessions(owner: string): InteractiveTerminalSessionSnapshot[] {
    return this.terminal
      .listManaged()
      .filter(
        (session) =>
          session.state === "running" && this.owners.get(session.id) === owner,
      );
  }

  async start(input: {
    owner: string;
    cwd: string;
    command: string;
    abortSignal?: AbortSignal;
    waitMs?: number;
  }): Promise<AppServerSnapshot> {
    input.abortSignal?.throwIfAborted();
    if (!input.owner.trim())
      throw new Error("A conversation is required to own the application.");
    if (
      !isAbsolute(input.cwd) ||
      input.cwd.length > 4096 ||
      !statSync(input.cwd).isDirectory()
    ) {
      throw new Error(
        "cwd must be the existing absolute application directory. Resolve it before starting.",
      );
    }
    if (
      !input.command.trim() ||
      input.command.length > 4096 ||
      input.command.includes("\0") ||
      /[\r\n]/u.test(input.command)
    ) {
      throw new Error(
        "An explicit single-line application start command is required.",
      );
    }
    if (
      input.command.includes("&") ||
      /(?:^|[;\s])(?:nohup|disown|setsid)(?:\s|$)/u.test(input.command)
    ) {
      throw new Error(
        "Run the server in the foreground. The managed terminal owns its lifetime; background and detached shell commands are not allowed.",
      );
    }
    const cwd = realpathSync(input.cwd);
    const existing = this.terminal
      .listManaged()
      .find(
        (session) =>
          session.state === "running" &&
          session.cwd === cwd &&
          session.command === input.command &&
          this.owners.get(session.id) === input.owner,
      );
    if (existing) return this.status(input.owner, existing.id);
    const conflictingWorkspaceSession = this.terminal
      .listManaged()
      .find((session) => session.state === "running" && session.cwd === cwd);
    if (conflictingWorkspaceSession) {
      throw new Error(
        "A managed application is already running from this directory in another session. Reuse its existing preview, or stop it before starting another server here.",
      );
    }
    const session = this.terminal.start({
      cwd,
      command: input.command,
    });
    this.owners.set(session.id, input.owner);
    const onAbort = () => {
      try {
        this.terminal.close(session.id);
      } catch {
        /* Shutdown may already have disposed the terminal. */
      }
      this.finishStartup(session.id);
    };
    input.abortSignal?.addEventListener("abort", onAbort, { once: true });
    this.startupAbortCleanup.set(session.id, () =>
      input.abortSignal?.removeEventListener("abort", onAbort),
    );
    try {
      const deadline =
        Date.now() + Math.min(15_000, Math.max(0, input.waitMs ?? 10_000));
      let snapshot = await this.status(input.owner, session.id);
      while (snapshot.status === "starting" && Date.now() < deadline) {
        input.abortSignal?.throwIfAborted();
        await delay(100, undefined, { signal: input.abortSignal });
        snapshot = await this.status(input.owner, session.id);
      }
      input.abortSignal?.throwIfAborted();
      return snapshot;
    } catch (error) {
      this.terminal.close(session.id);
      this.finishStartup(session.id);
      throw error;
    }
  }

  async status(owner: string, sessionId: string): Promise<AppServerSnapshot> {
    this.assertOwner(owner, sessionId);
    const result = this.terminal.output(sessionId);
    const output = stripVTControlCharacters(
      result.chunks.map((chunk) => chunk.data).join(""),
    ).slice(-16_000);
    if (result.session.state !== "running") {
      this.finishStartup(sessionId);
      this.readyUrls.delete(sessionId);
      return {
        session: result.session,
        output,
        status: result.session.state === "closed" ? "stopped" : "exited",
      };
    }
    // A URL is not ready merely because it appeared in a startup banner.
    for (const url of localAppUrls(output).slice(-4).reverse()) {
      if (await this.probe(url)) {
        const current = this.terminal.output(sessionId).session;
        this.finishStartup(sessionId);
        if (current.state === "running") {
          this.readyUrls.set(sessionId, url);
          return { session: current, output, status: "ready", url };
        }
        this.readyUrls.delete(sessionId);
        return {
          session: current,
          output,
          status: current.state === "closed" ? "stopped" : "exited",
        };
      }
    }
    const lastReadyUrl = this.readyUrls.get(sessionId);
    if (lastReadyUrl) {
      return {
        session: result.session,
        output,
        status: "unhealthy",
        url: lastReadyUrl,
      };
    }
    if (Date.now() - Date.parse(result.session.startedAt) > 120_000) {
      this.finishStartup(sessionId);
      this.readyUrls.delete(sessionId);
      return {
        session: this.terminal.close(sessionId),
        status: "stopped",
        output: `${output}\nStopped because no HTTP-ready local URL was observed within 120 seconds. Inspect the startup output and correct the command before retrying.`,
      };
    }
    return { session: result.session, output, status: "starting" };
  }

  stop(owner: string, sessionId: string): AppServerSnapshot {
    this.assertOwner(owner, sessionId);
    this.finishStartup(sessionId);
    this.readyUrls.delete(sessionId);
    const session = this.terminal.close(sessionId);
    return {
      session,
      status: session.state === "exited" ? "exited" : "stopped",
      output: "",
    };
  }

  private finishStartup(sessionId: string): void {
    this.startupAbortCleanup.get(sessionId)?.();
    this.startupAbortCleanup.delete(sessionId);
  }

  private assertOwner(owner: string, sessionId: string): void {
    if (this.owners.get(sessionId) !== owner) {
      throw new Error(
        "This application session does not belong to the current conversation.",
      );
    }
  }
}
