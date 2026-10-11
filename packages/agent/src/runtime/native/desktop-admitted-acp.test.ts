import { AcpService } from "@elizaos/plugin-agent-orchestrator";
import { afterEach, describe, expect, it, vi } from "vitest";

const admission = vi.hoisted(() => ({
  runId: "parent-run",
  acquire: vi.fn(),
  parentSignal: undefined as AbortSignal | undefined,
}));

vi.mock("@/runtime/execution-admission", () => ({
  getScopedExecutionLease: () => ({ runId: admission.runId }),
  acquireExecutionLease: admission.acquire,
}));
vi.mock("@/runtime/turn-runtime-scope", () => ({
  getScopedTurnAbortSignal: () => admission.parentSignal,
}));

import { DesktopAdmittedAcpService } from "./desktop-admitted-acp";

const originalDesktop = process.env.DOOLITTLE_DESKTOP_RUNTIME;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  admission.acquire.mockReset();
  admission.parentSignal = undefined;
  admission.runId = "parent-run";
  if (originalDesktop === undefined)
    delete process.env.DOOLITTLE_DESKTOP_RUNTIME;
  else process.env.DOOLITTLE_DESKTOP_RUNTIME = originalDesktop;
});

describe("desktop-admitted SDK ACP lifecycle", () => {
  function delayedAdmission() {
    const claims: Array<{
      signal: AbortSignal;
      grant: () => void;
    }> = [];
    const release = vi.fn(async () => undefined);
    admission.acquire.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          claims.push({ signal, grant: () => resolve({ release }) });
        }),
    );
    return { claims, release };
  }

  it("claims an automatic ACP seat before spawn and releases it after success", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    const release = vi.fn(async () => undefined);
    admission.acquire.mockResolvedValue({ release });
    const spawn = vi
      .spyOn(AcpService.prototype, "spawnSession")
      .mockResolvedValue({
        sessionId: "session-1",
        id: "session-1",
        name: "worker",
        agentType: "codex",
        workdir: "/workspace",
        status: "ready",
      } as never);
    const service = Object.create(
      DesktopAdmittedAcpService.prototype,
    ) as DesktopAdmittedAcpService;
    await service.spawnSession({
      workdir: "/workspace",
      metadata: { doolittleParentRunId: "parent-run" },
    });
    expect(admission.acquire).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "automatic-acp",
        sessionId: "parent-run",
      }),
    );
    expect(spawn).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("denies mismatched parent metadata and releases prompt seats after SDK errors", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    const release = vi.fn(async () => undefined);
    admission.acquire.mockResolvedValue({ release });
    const spawn = vi
      .spyOn(AcpService.prototype, "spawnSession")
      .mockResolvedValue({} as never);
    const get = vi.spyOn(AcpService.prototype, "getSession").mockResolvedValue({
      metadata: { doolittleParentRunId: "parent-run" },
    } as never);
    vi.spyOn(AcpService.prototype, "sendPrompt").mockRejectedValue(
      new Error("child failed"),
    );
    const service = Object.create(
      DesktopAdmittedAcpService.prototype,
    ) as DesktopAdmittedAcpService;
    await expect(
      service.spawnSession({ metadata: { doolittleParentRunId: "other" } }),
    ).rejects.toThrow("matching desktop run");
    expect(spawn).not.toHaveBeenCalled();
    await expect(service.sendPrompt("session-1", "task")).rejects.toThrow(
      "child failed",
    );
    expect(get).toHaveBeenCalledWith("session-1");
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not replay orphaned busy SDK sessions without a current admission", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    vi.spyOn(AcpService.prototype, "listSessions").mockResolvedValue([
      { id: "busy-1", status: "busy" },
      { id: "done-1", status: "completed" },
    ] as never);
    const stop = vi
      .spyOn(AcpService.prototype, "stopSession")
      .mockResolvedValue(undefined);
    const service = Object.create(
      DesktopAdmittedAcpService.prototype,
    ) as DesktopAdmittedAcpService;
    expect(await service.resumeOrphanedBusySessions()).toEqual({
      resumed: 0,
      skipped: 1,
    });
    expect(stop).toHaveBeenCalledExactlyOnceWith("busy-1");
  });

  it("stops only nonterminal SDK ACP children without unloading the service", async () => {
    vi.spyOn(AcpService.prototype, "listSessions").mockResolvedValue([
      { id: "busy-1", status: "busy" },
      { id: "done-1", status: "completed" },
    ] as never);
    const stop = vi
      .spyOn(AcpService.prototype, "stopSession")
      .mockResolvedValue(undefined);
    const service = Object.create(
      DesktopAdmittedAcpService.prototype,
    ) as DesktopAdmittedAcpService;
    expect(await service.stopAllAdmittedSessions()).toBe(1);
    expect(stop).toHaveBeenCalledExactlyOnceWith("busy-1");
  });

  it("cancels a queued spawn before stop-all and admits a later independent request", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    const { claims, release } = delayedAdmission();
    vi.spyOn(AcpService.prototype, "listSessions").mockResolvedValue([]);
    const spawn = vi
      .spyOn(AcpService.prototype, "spawnSession")
      .mockResolvedValue({ id: "new" } as never);
    const service = Object.create(
      DesktopAdmittedAcpService.prototype,
    ) as DesktopAdmittedAcpService;
    const waiting = service.spawnSession({
      metadata: { doolittleParentRunId: "parent-run" },
    });
    expect(claims).toHaveLength(1);
    expect(await service.stopAllAdmittedSessions()).toBe(0);
    expect(claims[0]?.signal.aborted).toBe(true);
    claims[0]?.grant();
    await expect(waiting).rejects.toThrow();
    expect(spawn).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();

    const next = service.spawnSession({
      metadata: { doolittleParentRunId: "parent-run" },
    });
    expect(claims).toHaveLength(2);
    claims[1]?.grant();
    await expect(next).resolves.toMatchObject({ id: "new" });
    expect(spawn).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("cancels a queued spawn when the parent turn aborts", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    const parent = new AbortController();
    admission.parentSignal = parent.signal;
    const { claims, release } = delayedAdmission();
    const spawn = vi
      .spyOn(AcpService.prototype, "spawnSession")
      .mockResolvedValue({} as never);
    const service = Object.create(
      DesktopAdmittedAcpService.prototype,
    ) as DesktopAdmittedAcpService;
    const waiting = service.spawnSession({
      metadata: { doolittleParentRunId: "parent-run" },
    });
    parent.abort();
    expect(claims[0]?.signal.aborted).toBe(true);
    claims[0]?.grant();
    await expect(waiting).rejects.toThrow();
    expect(spawn).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it("stops a child returned after stop-all during SDK spawn", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    const release = vi.fn(async () => undefined);
    admission.acquire.mockResolvedValue({ release });
    let finishSpawn!: (value: unknown) => void;
    const spawn = vi
      .spyOn(AcpService.prototype, "spawnSession")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finishSpawn = resolve;
          }) as never,
      );
    vi.spyOn(AcpService.prototype, "listSessions").mockResolvedValue([]);
    const stop = vi
      .spyOn(AcpService.prototype, "stopSession")
      .mockResolvedValue(undefined);
    const service = Object.create(
      DesktopAdmittedAcpService.prototype,
    ) as DesktopAdmittedAcpService;
    const pending = service.spawnSession({
      metadata: { doolittleParentRunId: "parent-run" },
    });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    let stopSettled = false;
    const stopping = service.stopAllAdmittedSessions().finally(() => {
      stopSettled = true;
    });
    await Promise.resolve();
    expect(stopSettled).toBe(false);
    finishSpawn({ sessionId: "late-child", id: "late-child" });
    await expect(pending).rejects.toThrow();
    await expect(stopping).resolves.toBe(1);
    expect(stop).toHaveBeenCalledExactlyOnceWith("late-child");
    expect(release).toHaveBeenCalledOnce();
  });

  it("fails stop-all confirmation when an SDK spawn never settles", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    const release = vi.fn(async () => undefined);
    admission.acquire.mockResolvedValue({ release });
    let finishSpawn!: (value: unknown) => void;
    const spawn = vi
      .spyOn(AcpService.prototype, "spawnSession")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finishSpawn = resolve;
          }) as never,
      );
    vi.spyOn(AcpService.prototype, "listSessions").mockResolvedValue([]);
    const stop = vi
      .spyOn(AcpService.prototype, "stopSession")
      .mockResolvedValue(undefined);
    const service = Object.create(
      DesktopAdmittedAcpService.prototype,
    ) as DesktopAdmittedAcpService;
    const pending = service.spawnSession({
      metadata: { doolittleParentRunId: "parent-run" },
    });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    vi.useFakeTimers();
    const stopping = expect(service.stopAllAdmittedSessions()).rejects.toThrow(
      "could not confirm SDK session teardown",
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await stopping;
    expect(release).not.toHaveBeenCalled();
    finishSpawn({ sessionId: "late-child", id: "late-child" });
    await expect(pending).rejects.toThrow();
    expect(stop).toHaveBeenCalledExactlyOnceWith("late-child");
    expect(release).toHaveBeenCalledOnce();
  });

  it("waits for an active prompt's SDK stop before confirming stop-all", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    const release = vi.fn(async () => undefined);
    admission.acquire.mockResolvedValue({ release });
    vi.spyOn(AcpService.prototype, "getSession").mockResolvedValue({
      metadata: { doolittleParentRunId: "parent-run" },
      status: "ready",
    } as never);
    vi.spyOn(AcpService.prototype, "listSessions").mockResolvedValue([]);
    let finishSend!: (value: unknown) => void;
    const send = vi
      .spyOn(AcpService.prototype, "sendPrompt")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finishSend = resolve;
          }) as never,
      );
    let finishStop!: () => void;
    const stop = vi
      .spyOn(AcpService.prototype, "stopSession")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finishStop = resolve;
          }),
      );
    const service = Object.create(
      DesktopAdmittedAcpService.prototype,
    ) as DesktopAdmittedAcpService;
    const prompt = service.sendPrompt("session-1", "task");
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    let stopSettled = false;
    const stopping = service.stopAllAdmittedSessions().finally(() => {
      stopSettled = true;
    });
    await vi.waitFor(() =>
      expect(stop).toHaveBeenCalledExactlyOnceWith("session-1"),
    );
    finishSend({});
    await Promise.resolve();
    expect(stopSettled).toBe(false);
    expect(release).not.toHaveBeenCalled();
    finishStop();
    await expect(prompt).rejects.toThrow();
    await expect(stopping).resolves.toBe(0);
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not send a queued prompt after its session stops", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    const { claims, release } = delayedAdmission();
    const get = vi.spyOn(AcpService.prototype, "getSession").mockResolvedValue({
      metadata: { doolittleParentRunId: "parent-run" },
      status: "ready",
    } as never);
    const send = vi
      .spyOn(AcpService.prototype, "sendPrompt")
      .mockResolvedValue({} as never);
    const stop = vi
      .spyOn(AcpService.prototype, "stopSession")
      .mockResolvedValue(undefined);
    const service = Object.create(
      DesktopAdmittedAcpService.prototype,
    ) as DesktopAdmittedAcpService;
    const waiting = service.sendPrompt("session-1", "task");
    await vi.waitFor(() => expect(claims).toHaveLength(1));
    await service.stopSession("session-1");
    expect(claims[0]?.signal.aborted).toBe(true);
    claims[0]?.grant();
    await expect(waiting).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledExactlyOnceWith("session-1");
    expect(get).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });
});
