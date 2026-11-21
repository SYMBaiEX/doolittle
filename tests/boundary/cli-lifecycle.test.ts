import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
import { DESKTOP_RUNTIME_READY_ACK } from "@doolittle/contracts/engine";
import { describe, expect, it, vi } from "vitest";
import { readPlainLoopLine } from "../../apps/cli/src/cli/plain-loop/input";
import { startCli } from "../../apps/cli/src/cli/start/index";
import { waitForTuiDestroy } from "../../apps/cli/src/cli/tui-runtime-shell";
import {
  createApiStartupController,
  resolveEntrypointRuntimePlan,
} from "../../apps/cli/src/entrypoint/runtime-control";
import { installRuntimeProcessLifecycle } from "../../apps/cli/src/entrypoint/runtime-process-lifecycle";
import { handleEntrypointRuntimeSurface } from "../../apps/cli/src/entrypoint/runtime-surface";
import { loadProcessEnv } from "../../packages/agent/src/config/env/load";
import { resolveApplicationRoot } from "../../packages/agent/src/config/env/paths";
import type { AppLogger } from "../../packages/agent/src/logging/logger";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";

describe("terminal application lifecycle", () => {
  it("settles the cockpit lifecycle when screen cleanup fails", async () => {
    const screen = new EventEmitter();
    const failure = new Error("unable to restore console");
    const onCleanupFailure = vi.fn();
    const closed = waitForTuiDestroy({
      screen,
      markScreenDestroyed: vi.fn(),
      cleanup: () => {
        throw failure;
      },
      isShuttingDown: () => true,
      getExitCode: () => 0,
      onUnexpectedDestroy: vi.fn(),
      onCleanupFailure,
    });
    screen.emit("destroy");
    await expect(closed).resolves.toBe(1);
    expect(onCleanupFailure).toHaveBeenCalledWith(failure);
  });
  it("closes the session immediately when the IPC host has already disconnected", async () => {
    const signalHost = Object.assign(new EventEmitter(), { connected: false });
    const close = vi.fn(async () => undefined);
    const onExit = vi.fn();
    const lifecycle = installRuntimeProcessLifecycle({
      label: "ACP",
      signalHost,
      watchHostDisconnect: true,
      close,
      onExit,
    });

    expect(lifecycle.closing).toBeDefined();
    signalHost.emit("SIGTERM");
    await lifecycle.closing;
    expect(close).toHaveBeenCalledExactlyOnceWith(
      "ACP received host IPC disconnect",
    );
    expect(onExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("reports a failed shutdown as an unsuccessful process exit", async () => {
    const signalHost = new EventEmitter();
    const writeError = vi.fn();
    const onExit = vi.fn();
    const lifecycle = installRuntimeProcessLifecycle({
      label: "API",
      signalHost,
      close: async () => {
        throw new Error("unable to close adapter");
      },
      writeError,
      onExit,
    });

    signalHost.emit("SIGTERM");
    await lifecycle.closing;
    expect(writeError).toHaveBeenCalledWith(
      "[doolittle] API shutdown failed: unable to close adapter",
    );
    expect(onExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("uses dotenv parsing to detect a database declaration", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-database-env-"));
    try {
      const env: NodeJS.ProcessEnv = { DATABASE_URL: "fixture-inherited" };
      expect(loadProcessEnv(root, { env }).declaresDatabaseUrl).toBe(false);
      writeFileSync(
        resolve(root, ".env"),
        "# DATABASE_URL=comment\nOTHER=fixture\n",
      );
      expect(loadProcessEnv(root, { env }).declaresDatabaseUrl).toBe(false);
      writeFileSync(resolve(root, ".env"), "export POSTGRES_URL=fixture\n");
      expect(loadProcessEnv(root, { env }).declaresDatabaseUrl).toBe(true);
      expect(env.POSTGRES_URL).toBe("fixture");
      expect(env.DATABASE_URL).toBe("fixture-inherited");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a repository dotenv path that is not a regular file", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-invalid-env-"));
    try {
      mkdirSync(resolve(root, ".env"));
      expect(() => loadProcessEnv(root, { env: {} })).toThrow(
        "Unable to read application .env safely.",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("settles a pending plain CLI prompt when the input reaches EOF", async () => {
    const input = new PassThrough();
    const readline = createInterface({ input });
    const pending = readPlainLoopLine({
      rl: readline,
      context: {} as AppContext,
      state: { activeSessionId: "cli:session", notices: [] },
      interactiveShell: false,
      lifecycleState: {
        closed: false,
        activeTurnAbortController: null,
        turnCancellationPending: false,
      },
    });
    input.end();
    await expect(pending).resolves.toBeNull();
  });

  it.each(["cli", "both"] as const)(
    "only starts an API listener when mode=%s requests it",
    async (mode) => {
      const startServer = vi.fn();
      const shutdown = vi.fn();
      const exit = vi.fn();
      const runtimePlan = resolveEntrypointRuntimePlan({
        command: "start",
        shellIsInteractive: true,
        mode,
      });
      await handleEntrypointRuntimeSurface({
        command: "start",
        runtimePlan,
        context: { runtime: {}, config: { mode } } as AppContext,
        runtimeLogger: { info: vi.fn() } as unknown as AppLogger,
        startServerWhenShellReady: startServer,
        apiOwnsRuntimeAfterCli: async () => mode === "both",
        startCli: async (_context, options) => {
          options?.onReady?.();
          return 0;
        },
        shutdownRuntime: shutdown,
        exit,
        bootLogs: [],
      });
      expect(startServer).toHaveBeenCalledTimes(mode === "both" ? 1 : 0);
      expect(shutdown).toHaveBeenCalledTimes(mode === "cli" ? 1 : 0);
      expect(exit).toHaveBeenCalledTimes(mode === "cli" ? 1 : 0);
    },
  );

  it("does not attach an interactive shell to an explicit API command", () => {
    expect(
      resolveEntrypointRuntimePlan({
        command: "api",
        shellIsInteractive: true,
        mode: "both",
      }),
    ).toEqual({
      shouldStartCli: false,
      shouldStartApi: true,
      shouldStartApiImmediately: true,
    });
  });

  it("selects the one-shot surface before an interactive shell or shared API", () => {
    expect(
      resolveEntrypointRuntimePlan({
        command: "exec",
        shellIsInteractive: true,
        mode: "both",
        immediatePrompt: "  Inspect the current workspace.  ",
      }),
    ).toEqual({
      shouldStartCli: false,
      shouldStartApi: false,
      shouldStartApiImmediately: false,
      oneShotPrompt: "Inspect the current workspace.",
    });
  });

  it("shuts down the runtime when the shared API could not bind", async () => {
    const shutdown = vi.fn();
    const exit = vi.fn();
    const writeStderrLine = vi.fn();
    const startIngress = vi.fn();
    const runtimeLogger = { warn: vi.fn() } as unknown as AppLogger;
    const context = {
      runtime: {},
      config: { mode: "both", port: 31337 },
      gateway: { startIngress },
      ensureDeferredHydration: async () => undefined,
    } as unknown as AppContext;
    const api = createApiStartupController({
      context,
      command: "start",
      runtimeLogger,
      shouldStartCli: true,
      startApiServer: async () => {
        throw Object.assign(new Error("port in use"), { code: "EADDRINUSE" });
      },
      writeStderrLine,
      formatTopLevelError: String,
    });

    await handleEntrypointRuntimeSurface({
      command: "start",
      runtimePlan: resolveEntrypointRuntimePlan({
        command: "start",
        shellIsInteractive: true,
        mode: "both",
      }),
      context,
      runtimeLogger,
      ...api,
      startCli: async (_context, options) => {
        options?.onReady?.();
        await Promise.resolve();
        return 0;
      },
      shutdownRuntime: shutdown,
      exit,
      bootLogs: [],
    });

    expect(writeStderrLine).toHaveBeenCalledWith(
      "API port 31337 is already in use. Continuing with local CLI only.",
    );
    expect(startIngress).not.toHaveBeenCalled();
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("does not bind an API after the terminal closes during hydration", async () => {
    let finishHydration!: () => void;
    const hydration = new Promise<void>(
      (resolve) => (finishHydration = resolve),
    );
    const listen = vi.fn();
    const api = createApiStartupController({
      context: { ensureDeferredHydration: () => hydration } as AppContext,
      command: "start",
      runtimeLogger: {} as AppLogger,
      shouldStartCli: true,
      startApiServer: listen,
      writeStderrLine: vi.fn(),
      formatTopLevelError: String,
    });

    api.startServerWhenShellReady();
    expect(await api.apiOwnsRuntimeAfterCli()).toBe(false);
    finishHydration();
    await hydration;
    expect(listen).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "hydrates the desktop runtime once with host acknowledgement %s",
    async (acknowledged) => {
      vi.useFakeTimers();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const hydrate = vi.fn(async () => undefined);
      const startIngress = vi.fn();
      const api = createApiStartupController({
        context: {
          config: { agentName: "Fixture", host: "127.0.0.1", port: 1234 },
          gateway: { startIngress },
          ensureDeferredHydration: hydrate,
        } as unknown as AppContext,
        command: "api",
        runtimeLogger: { info: vi.fn() } as unknown as AppLogger,
        shouldStartCli: false,
        startApiServer: vi.fn(),
        writeStderrLine: vi.fn(),
        formatTopLevelError: String,
        hydrateAfterListening: true,
      });
      const listeners = process.listenerCount("message");
      try {
        await expect(api.startServer()).resolves.toBe(true);
        expect(log).toHaveBeenCalledWith(
          "Fixture API listening on http://127.0.0.1:1234",
        );
        process.emit("message", "another IPC message");
        await vi.advanceTimersByTimeAsync(1);
        expect(hydrate).not.toHaveBeenCalled();
        expect(startIngress).not.toHaveBeenCalled();
        if (acknowledged) {
          process.emit("message", DESKTOP_RUNTIME_READY_ACK);
          await vi.advanceTimersByTimeAsync(1);
          expect(hydrate).toHaveBeenCalledOnce();
        }
        await vi.runAllTimersAsync();
        expect(hydrate).toHaveBeenCalledExactlyOnceWith("desktop-api");
        expect(startIngress).toHaveBeenCalledOnce();
        expect(process.listenerCount("message")).toBe(listeners);
      } finally {
        await vi.runAllTimersAsync();
        log.mockRestore();
        vi.useRealTimers();
      }
    },
  );

  it("falls back once when cockpit initialization fails", async () => {
    const launchFailure = new Error("unable to initialize cockpit");
    const shellFailure = new Error("unable to start readline");
    const plain = vi.fn().mockRejectedValue(shellFailure);
    const importTui = vi.fn().mockRejectedValue(launchFailure);
    const warn = vi.fn();
    const context = {
      config: { agentName: "Eliza" },
      services: { logger: { child: () => ({ warn }) } },
    } as unknown as AppContext;
    await expect(
      startCli(
        context,
        { mode: "tui" },
        {
          argv: [],
          stdinIsTTY: true,
          stdoutIsTTY: true,
          startPlainCli: plain,
          importTui,
          warn,
        },
      ),
    ).rejects.toThrow(shellFailure);
    expect(plain).toHaveBeenCalledTimes(1);
    expect(importTui).toHaveBeenCalledTimes(1);
  });

  it("finds the application root from both source modules and a bundled CLI", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-root-discovery-"));
    try {
      writeFileSync(
        resolve(root, "package.json"),
        JSON.stringify({
          name: "doolittle",
          workspaces: ["apps/*", "packages/*"],
        }),
      );
      mkdirSync(resolve(root, "apps/cli/dist"), { recursive: true });
      mkdirSync(resolve(root, "packages/agent/src/config/env"), {
        recursive: true,
      });
      writeFileSync(
        resolve(root, "apps/cli/package.json"),
        JSON.stringify({ name: "@doolittle/cli" }),
      );
      for (const entry of [
        "apps/cli/dist/index.js",
        "packages/agent/src/config/env/paths.ts",
      ])
        expect(
          resolveApplicationRoot(pathToFileURL(resolve(root, entry)).href),
        ).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
