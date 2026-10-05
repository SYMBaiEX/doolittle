import { AcpService } from "@elizaos/plugin-agent-orchestrator";
import { afterEach, describe, expect, it, vi } from "vitest";

const admission = vi.hoisted(() => ({
  runId: "parent-run",
  acquire: vi.fn(),
}));

vi.mock("@/runtime/execution-admission", () => ({
  getScopedExecutionLease: () => ({ runId: admission.runId }),
  acquireExecutionLease: admission.acquire,
}));

import { DesktopAdmittedAcpService } from "./desktop-admitted-acp";

const originalDesktop = process.env.DOOLITTLE_DESKTOP_RUNTIME;

afterEach(() => {
  vi.restoreAllMocks();
  admission.acquire.mockReset();
  if (originalDesktop === undefined)
    delete process.env.DOOLITTLE_DESKTOP_RUNTIME;
  else process.env.DOOLITTLE_DESKTOP_RUNTIME = originalDesktop;
});

describe("desktop-admitted SDK ACP lifecycle", () => {
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
});
