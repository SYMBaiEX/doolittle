import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/runtime/bootstrap/runtime/initialization", () => ({
  disposeRuntime: vi.fn(),
}));

import { installRuntimeProcessLifecycle } from "./runtime-process-lifecycle";

describe("installRuntimeProcessLifecycle", () => {
  it("hands SIGTERM to the official runtime shutdown boundary once", async () => {
    const signalHost = new EventEmitter();
    const shutdownRuntime = vi.fn().mockResolvedValue(undefined);
    const onExit = vi.fn();
    const lifecycle = installRuntimeProcessLifecycle({
      runtime: {} as never,
      label: "Doolittle API",
      signalHost,
      shutdownRuntime,
      onExit,
    });

    signalHost.emit("SIGTERM");
    signalHost.emit("SIGTERM");
    await lifecycle.shutdown("SIGTERM");

    expect(shutdownRuntime).toHaveBeenCalledOnce();
    expect(shutdownRuntime).toHaveBeenCalledWith(
      expect.anything(),
      "Doolittle API received SIGTERM",
      undefined,
      { fast: true },
    );
    expect(onExit).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledWith(0);
    expect(signalHost.listenerCount("SIGINT")).toBe(0);
    expect(signalHost.listenerCount("SIGTERM")).toBe(0);
  });

  it("reports shutdown failures but still terminates an interrupted API host", async () => {
    const signalHost = new EventEmitter();
    const shutdownRuntime = vi
      .fn()
      .mockRejectedValue(new Error("adapter close failed"));
    const onExit = vi.fn();
    const writeError = vi.fn();
    const lifecycle = installRuntimeProcessLifecycle({
      runtime: {} as never,
      label: "Doolittle API",
      signalHost,
      shutdownRuntime,
      onExit,
      writeError,
    });

    await lifecycle.shutdown("SIGINT");

    expect(writeError).toHaveBeenCalledWith(
      "[doolittle] runtime shutdown failed: adapter close failed",
    );
    expect(onExit).toHaveBeenCalledWith(130);
  });

  it("records fatal API failures without changing Node's fatal exit semantics", () => {
    const signalHost = new EventEmitter();
    const captureFatal = vi.fn();
    const onExit = vi.fn();
    const lifecycle = installRuntimeProcessLifecycle({
      runtime: {} as never,
      label: "Doolittle API",
      signalHost,
      captureFatal,
      onExit,
    });
    const error = new Error("background task failed");

    signalHost.emit("uncaughtExceptionMonitor", error, "unhandledRejection");

    expect(captureFatal).toHaveBeenCalledOnce();
    expect(captureFatal).toHaveBeenCalledWith(error, "unhandledRejection");
    expect(onExit).not.toHaveBeenCalled();

    lifecycle.dispose();
    expect(signalHost.listenerCount("uncaughtExceptionMonitor")).toBe(0);
  });
});
