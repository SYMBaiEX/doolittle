import type { ChildProcess } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  AcpService,
  InMemorySessionStore,
} from "@elizaos/plugin-agent-orchestrator";
import { afterEach, describe, expect, it, vi } from "vitest";

// Exercise both published runtime bundles, not a Doolittle replacement service.
const require = createRequire(import.meta.url);
const sdkRoot = dirname(
  require.resolve("@elizaos/plugin-agent-orchestrator/package.json"),
);
const cjs = require(join(sdkRoot, "dist/cjs/index.node.cjs")) as {
  AcpService: typeof AcpService;
  InMemorySessionStore: typeof InMemorySessionStore;
};

type Session = Parameters<InMemorySessionStore["create"]>[0];
type Transport = "native" | "cli";

// The SDK exposes the service and store publicly, but not the health timer.
// These private hooks are test-only: no production monkeypatch or home access.
interface HealthTestHooks {
  acpxStateRoot(): string;
  runHealthCheck(): Promise<void>;
  activeProcesses: Map<string, ChildProcess>;
  nativeClients: Map<string, NativeClientProbe>;
}

interface NativeClientProbe {
  prompt(sessionId: string, text: string): Promise<{ stopReason: string }>;
  setEventHandler(handler: unknown): void;
  setTimeoutMs(timeoutMs: number | undefined): void;
  close(): Promise<void>;
}

const resources: Array<{
  root: string;
  service: AcpService;
  hooks: HealthTestHooks;
}> = [];

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    resource.hooks.activeProcesses.clear();
    await resource.service.stop();
    await rm(resource.root, { recursive: true, force: true });
  }
});

describe.each([
  ["ESM", AcpService, InMemorySessionStore],
  ["CJS", cjs.AcpService, cjs.InMemorySessionStore],
] as const)("pinned SDK ACP health patch (%s)", (_bundle, Service, Store) => {
  async function fixture(transport: Transport, seed: Session[] = []) {
    const root = await mkdtemp(join(tmpdir(), "doolittle-acp-health-"));
    const store = new Store();
    for (const session of seed) await store.create(session);
    const service = new Service(
      {
        getSetting: (key: string) =>
          key === "ELIZA_ACP_TRANSPORT" ? transport : undefined,
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
      } as unknown as ConstructorParameters<typeof AcpService>[0],
      { store },
    );
    const hooks = service as unknown as HealthTestHooks;
    const stateRoot = vi.fn(() => root);
    hooks.acpxStateRoot = stateRoot;
    const events: Array<{ id: string; event: string; data: unknown }> = [];
    service.onSessionEvent((id, event, data) =>
      events.push({ id, event, data }),
    );
    resources.push({ root, service, hooks });
    return { root, store, service, hooks, stateRoot, events };
  }

  function session(status = "busy", ageMs = 120_000): Session {
    const past = new Date(Date.now() - ageMs);
    return {
      id: "worker",
      agentType: "codex",
      workdir: "/unused-test-workspace",
      status,
      acpxSessionId: "protocol-session",
      approvalPreset: "standard",
      createdAt: past,
      lastActivityAt: past,
    };
  }

  async function oldFile(root: string, relativePath: string, ageMs: number) {
    const path = join(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "fixture", { mode: 0o600 });
    const past = new Date(Date.now() - ageMs);
    await utimes(path, past, past);
    return path;
  }

  it("does not mark a quiet native worker lost or touch CLI files", async () => {
    const f = await fixture("native");
    const stream = await oldFile(
      f.root,
      "sessions/untracked.stream.ndjson",
      48 * 60 * 60_000,
    );
    const lock = await oldFile(f.root, "queues/untracked.lock", 20 * 60_000);
    await f.service.start();
    for (const status of ["running", "busy", "tool_running"]) {
      await f.store.create(session(status));
      await f.hooks.runHealthCheck();
      expect((await f.service.getSession("worker"))?.status).toBe(status);
    }
    expect(f.events).toEqual([]);
    expect(f.stateRoot).not.toHaveBeenCalled();
    expect(await readFile(stream, "utf8")).toBe("fixture");
    expect(await readFile(lock, "utf8")).toBe("fixture");
  });

  it("does not treat a native protocol ID as persisted CLI restart evidence", async () => {
    const f = await fixture("native", [session()]);
    await oldFile(f.root, "sessions/protocol-session.json", 0);
    await f.service.start();
    expect((await f.service.getSession("worker"))?.status).toBe("errored");
    expect((await f.service.getSession("worker"))?.lastError).toContain(
      "runtime restarted",
    );
    expect(f.stateRoot).not.toHaveBeenCalled();
  });

  it("still reports genuine CLI state loss", async () => {
    const f = await fixture("cli");
    await f.service.start();
    await f.store.create(session());
    await f.hooks.runHealthCheck();
    expect((await f.service.getSession("worker"))?.status).toBe("errored");
    expect(f.events).toEqual([
      {
        id: "worker",
        event: "error",
        data: {
          message: expect.stringContaining("state was lost"),
          failureKind: "session_state_lost",
        },
      },
    ]);
  });

  it("still reports a native transport error through the public prompt API", async () => {
    const f = await fixture("native");
    await f.service.start();
    await f.store.create(session("ready"));
    f.hooks.nativeClients.set("worker", {
      prompt: vi
        .fn()
        .mockRejectedValue(new Error("Synthetic transport failure")),
      setEventHandler: vi.fn(),
      setTimeoutMs: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    });
    const result = await f.service.sendPrompt("worker", "Synthetic task");
    expect(result).toMatchObject({
      stopReason: "error",
      exitCode: 1,
      error: "Synthetic transport failure",
    });
    expect((await f.service.getSession("worker"))?.status).toBe("errored");
    expect(f.events).toEqual([
      {
        id: "worker",
        event: "error",
        data: { message: "Synthetic transport failure" },
      },
    ]);
    expect(f.stateRoot).not.toHaveBeenCalled();
  });

  it("still preserves native cancellation", async () => {
    const f = await fixture("native");
    await f.service.start();
    await f.store.create(session("ready"));
    f.hooks.nativeClients.set("worker", {
      prompt: vi.fn().mockResolvedValue({ stopReason: "cancelled" }),
      setEventHandler: vi.fn(),
      setTimeoutMs: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    });
    const result = await f.service.sendPrompt("worker", "Synthetic task");
    expect(result.stopReason).toBe("cancelled");
    expect((await f.service.getSession("worker"))?.status).toBe("cancelled");
    expect(f.events).toEqual([]);
    expect(f.stateRoot).not.toHaveBeenCalled();
  });

  it("does not mistake an actively tracked CLI process for an orphan", async () => {
    const f = await fixture("cli");
    await f.service.start();
    await f.store.create(session());
    f.hooks.activeProcesses.set("worker", {} as ChildProcess);
    await f.hooks.runHealthCheck();
    expect((await f.service.getSession("worker"))?.status).toBe("busy");
    expect(f.events).toEqual([]);
    f.hooks.activeProcesses.delete("worker");
    await f.hooks.runHealthCheck();
    expect((await f.service.getSession("worker"))?.status).toBe("errored");
    expect(f.events).toHaveLength(1);
  });

  it("preserves CLI files and recent-activity exemptions", async () => {
    const f = await fixture("cli");
    await f.service.start();
    await f.store.create(session());
    await oldFile(f.root, "sessions/protocol-session.json", 120_000);
    await f.hooks.runHealthCheck();
    expect((await f.service.getSession("worker"))?.status).toBe("busy");
    await f.store.create({
      ...session("tool_running", 0),
      id: "recent",
      acpxSessionId: "missing",
    });
    await f.hooks.runHealthCheck();
    expect((await f.service.getSession("recent"))?.status).toBe("tool_running");
    expect(f.events).toEqual([]);
  });

  it("preserves CLI restart reconciliation and cleanup", async () => {
    const f = await fixture("cli", [session()]);
    await oldFile(f.root, "sessions/protocol-session.json", 0);
    const tracked = await oldFile(
      f.root,
      "sessions/protocol-session.stream.ndjson",
      48 * 60 * 60_000,
    );
    const stale = await oldFile(
      f.root,
      "sessions/untracked.stream.ndjson",
      48 * 60 * 60_000,
    );
    const recent = await oldFile(f.root, "sessions/recent.stream.ndjson", 0);
    const lock = await oldFile(f.root, "queues/untracked.lock", 20 * 60_000);
    await f.service.start();
    expect((await f.service.getSession("worker"))?.status).toBe("busy");
    expect(await readFile(tracked, "utf8")).toBe("fixture");
    expect(await readFile(recent, "utf8")).toBe("fixture");
    await expect(readFile(stale)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(lock)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("still reclaims terminal sessions in both transports", async () => {
    for (const transport of ["native", "cli"] as const) {
      const f = await fixture(transport);
      await f.service.start();
      await f.store.create(session("errored", 2 * 60 * 60_000));
      await f.hooks.runHealthCheck();
      expect(await f.service.getSession("worker")).toBeUndefined();
      expect(f.events).toEqual([]);
    }
  });
});
