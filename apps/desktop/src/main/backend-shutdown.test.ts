import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));

import {
  BackendManager,
  backendExitDetail,
  terminateBackendChild,
} from "./backend";

function mockChild() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn((signal: NodeJS.Signals) => {
      child.signalCode = signal;
      queueMicrotask(() => child.emit("exit", null, signal));
      return true;
    }),
  });
  return child;
}

describe("BackendManager shutdown during startup", () => {
  beforeEach(() => spawn.mockReset());

  it("still performs one PGlite recovery when shutdown was not requested", async () => {
    const runtimeDataDir = mkdtempSync(join(tmpdir(), "doolittle-shutdown-"));
    const pgliteDir = join(runtimeDataDir, "pglite");
    mkdirSync(pgliteDir);
    writeFileSync(join(pgliteDir, "PG_VERSION"), "17");
    const failedChild = mockChild();
    const recoveredChild = mockChild();
    spawn.mockReturnValueOnce(failedChild).mockReturnValueOnce(recoveredChild);
    const backend = new BackendManager(
      { executable: "unused", args: [], repoRoot: resolve("/tmp") },
      runtimeDataDir,
      resolve("/tmp/workspace"),
      (async () => new Response(null, { status: 200 })) as typeof fetch,
    );

    try {
      const startup = backend.start();
      failedChild.stderr.emit(
        "data",
        Buffer.from("PGlite initialization failed: Aborted()"),
      );
      failedChild.emit("exit", 1, null);
      await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
      recoveredChild.stdout.emit(
        "data",
        Buffer.from("Doolittle API listening on http://127.0.0.1:43817\n"),
      );

      await expect(startup).resolves.toMatchObject({
        phase: "ready",
        url: "http://127.0.0.1:43817",
      });
      expect(existsSync(join(pgliteDir, "PG_VERSION"))).toBe(false);
      expect(spawn).toHaveBeenCalledTimes(2);
      await backend.stop();
    } finally {
      rmSync(runtimeDataDir, { recursive: true, force: true });
    }
  });

  it("does not preserve PGlite data or relaunch after stop is requested", async () => {
    const runtimeDataDir = mkdtempSync(join(tmpdir(), "doolittle-shutdown-"));
    const pgliteDir = join(runtimeDataDir, "pglite");
    mkdirSync(pgliteDir);
    writeFileSync(join(pgliteDir, "PG_VERSION"), "17");
    const child = mockChild();
    spawn.mockReturnValue(child);
    const backend = new BackendManager(
      { executable: "unused", args: [], repoRoot: resolve("/tmp") },
      runtimeDataDir,
      resolve("/tmp/workspace"),
    );

    try {
      const startup = backend.start();
      child.stderr.emit(
        "data",
        Buffer.from("PGlite initialization failed: Aborted()"),
      );
      await backend.stop();
      await startup;

      expect(spawn).toHaveBeenCalledTimes(1);
      expect(existsSync(join(pgliteDir, "PG_VERSION"))).toBe(true);
      expect(backend.getState().phase).toBe("stopped");
    } finally {
      rmSync(runtimeDataDir, { recursive: true, force: true });
    }
  });

  it("records shutdown intent after the starting child already exited", async () => {
    const runtimeDataDir = mkdtempSync(join(tmpdir(), "doolittle-shutdown-"));
    const pgliteDir = join(runtimeDataDir, "pglite");
    mkdirSync(pgliteDir);
    writeFileSync(join(pgliteDir, "PG_VERSION"), "17");
    const child = mockChild();
    spawn.mockReturnValue(child);
    const backend = new BackendManager(
      { executable: "unused", args: [], repoRoot: resolve("/tmp") },
      runtimeDataDir,
      resolve("/tmp/workspace"),
    );

    try {
      const startup = backend.start();
      child.stderr.emit(
        "data",
        Buffer.from("PGlite initialization failed: Aborted()"),
      );
      child.emit("exit", 1, null);
      await backend.stop();
      await startup;

      expect(spawn).toHaveBeenCalledTimes(1);
      expect(existsSync(join(pgliteDir, "PG_VERSION"))).toBe(true);
      expect(backend.getState().phase).toBe("stopped");
    } finally {
      rmSync(runtimeDataDir, { recursive: true, force: true });
    }
  });

  it("does not let a stopped-state listener relaunch during stop", async () => {
    const backend = new BackendManager(
      { executable: "unused", args: [], repoRoot: resolve("/tmp") },
      resolve("/tmp/doolittle-shutdown"),
      resolve("/tmp/workspace"),
    );
    const listenerStarts: Promise<unknown>[] = [];
    backend.subscribe((state) => {
      if (state.phase === "stopped") listenerStarts.push(backend.start());
    });

    await backend.stop();
    await Promise.all(listenerStarts);

    expect(listenerStarts).toHaveLength(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(backend.getState().phase).toBe("stopped");
  });

  it("keeps listener starts blocked until concurrent stops finish", async () => {
    const child = mockChild();
    spawn.mockReturnValue(child);
    const backend = new BackendManager(
      { executable: "unused", args: [], repoRoot: resolve("/tmp") },
      resolve("/tmp/doolittle-shutdown"),
      resolve("/tmp/workspace"),
    );
    const startup = backend.start();
    const listenerStarts: Promise<unknown>[] = [];
    backend.subscribe((state) => {
      if (state.phase === "stopped") listenerStarts.push(backend.start());
    });

    await Promise.all([backend.stop(), backend.stop()]);
    await startup;
    await Promise.all(listenerStarts);

    expect(listenerStarts).toHaveLength(2);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(backend.getState().phase).toBe("stopped");
  });

  it("retains bounded, redacted runtime output when a ready backend exits", async () => {
    const runtimeDataDir = mkdtempSync(join(tmpdir(), "doolittle-exit-log-"));
    const child = mockChild();
    spawn.mockReturnValue(child);
    const backend = new BackendManager(
      { executable: "unused", args: [], repoRoot: resolve("/tmp") },
      runtimeDataDir,
      resolve("/tmp/workspace"),
      (async () => new Response(null, { status: 200 })) as typeof fetch,
    );

    try {
      const startup = backend.start();
      child.stdout.emit(
        "data",
        Buffer.from("Doolittle API listening on http://127.0.0.1:43817\n"),
      );
      await expect(startup).resolves.toMatchObject({ phase: "ready" });

      child.stderr.emit(
        "data",
        Buffer.from(
          "Fatal provider failure OPENAI_API_KEY=sk-private Authorization: Bearer-private\n",
        ),
      );
      child.emit("exit", 1, null);

      expect(backend.getState()).toMatchObject({
        phase: "degraded",
        message: "Doolittle’s local runtime stopped unexpectedly.",
      });
      expect(backend.getState().detail).toContain("Fatal provider failure");
      expect(backend.getState().detail).toContain("[REDACTED]");
      expect(backend.getState().detail).not.toContain("sk-private");
      expect(backend.getState().detail).not.toContain("Bearer-private");

      const persisted = readFileSync(
        join(runtimeDataDir, "logs", "desktop-backend.jsonl"),
        "utf8",
      );
      expect(persisted).toContain('"event":"runtime-exit"');
      expect(persisted).toContain('"code":1');
      expect(persisted).toContain("[REDACTED]");
      expect(persisted).not.toContain("sk-private");
      expect(persisted).not.toContain("Bearer-private");
    } finally {
      rmSync(runtimeDataDir, { recursive: true, force: true });
    }
  });
});

describe("backendExitDetail", () => {
  it("bounds diagnostics while preserving the exit identity", () => {
    const detail = backendExitDetail(137, null, `old-${"x".repeat(3_000)}`);

    expect(detail).toContain("Runtime exited (code 137).");
    expect(detail).not.toContain("old-");
    expect(detail.length).toBeLessThan(2_100);
  });

  it("redacts exact sensitive environment values in unstructured output", () => {
    const key = "DOOLITTLE_BACKEND_TEST_ACCESS_TOKEN";
    const original = process.env[key];
    process.env[key] = "unstructured-private-value";
    try {
      const detail = backendExitDetail(
        1,
        null,
        "Provider printed unstructured-private-value before exit",
      );

      expect(detail).toContain("Provider printed [REDACTED]");
      expect(detail).not.toContain("unstructured-private-value");
    } finally {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });
});

describe("terminateBackendChild", () => {
  it("waits for actual exit after escalating to SIGKILL", async () => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      kill: vi.fn(() => true),
    });

    try {
      let completed = false;
      const stopping = terminateBackendChild(child, 20, 20).then(() => {
        completed = true;
      });

      await vi.advanceTimersByTimeAsync(20);
      expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
      expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
      expect(completed).toBe(false);

      child.signalCode = "SIGKILL";
      child.emit("exit", null, "SIGKILL");
      await stopping;
      expect(completed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels restart when a killed runtime never exits", async () => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      kill: vi.fn(() => true),
    });

    try {
      const stopping = terminateBackendChild(child, 20, 20);
      const rejection = expect(stopping).rejects.toThrow(
        "restart was cancelled to protect the local database",
      );
      await vi.advanceTimersByTimeAsync(40);
      await rejection;
      expect(child.kill).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
