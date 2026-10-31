import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { executeManagedDelegation } from "../../packages/agent/src/runtime/native/coding-delegation/execution";
import type { ManagedAcpService } from "../../packages/agent/src/runtime/native/coding-delegation/types";
import { RunControllerService } from "../../packages/agent/src/services/run-controller-service";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "doolittle-delegated-lifecycle-"));
  roots.push(root);
  const unsubscribe = vi.fn();
  const service = {
    spawnSession: vi.fn(async () => ({
      sessionId: "owned-child",
      agentType: "codex",
      workdir: root,
      status: "ready",
    })),
    sendPrompt: vi.fn(async () => ({ stopReason: "end_turn", exitCode: 0 })),
    cancelSession: vi.fn(async () => {}),
    stopSession: vi.fn(async () => {}),
    onSessionEvent: vi.fn(() => unsubscribe),
  } satisfies ManagedAcpService;
  const execute = (signal?: AbortSignal) =>
    executeManagedDelegation({
      service,
      options: { workdir: root, initialTask: "Repair the project" },
      roomId: "parent-room",
      services: {
        workspace: { root: () => root },
        runController: new RunControllerService(),
      },
      signal,
    });
  return { service, execute, unsubscribe };
}

it("awaits child shutdown when attaching the SDK event subscription fails", async () => {
  const { service, execute } = await fixture();
  service.onSessionEvent.mockImplementation(() => {
    throw new Error("subscription failed");
  });
  let release!: () => void;
  const stopped = new Promise<void>((resolve) => {
    release = resolve;
  });
  service.stopSession.mockImplementation(() => stopped);
  let settled = false;
  const controller = new AbortController();
  const result = execute(controller.signal).catch((error: unknown) => {
    settled = true;
    return error;
  });
  await vi.waitFor(() =>
    expect(service.stopSession).toHaveBeenCalledWith("owned-child"),
  );
  expect(settled).toBe(false);
  expect(service.sendPrompt).not.toHaveBeenCalled();
  release();
  expect(await result).toMatchObject({ message: "subscription failed" });
  controller.abort();
  expect(service.cancelSession).not.toHaveBeenCalled();
  expect(service.stopSession).toHaveBeenCalledTimes(1);
});

it("closes the child and refuses success when removing its event subscription fails", async () => {
  const { service, execute, unsubscribe } = await fixture();
  unsubscribe.mockImplementation(() => {
    throw new Error("unsubscribe failed");
  });
  const { receipt } = await execute();
  expect(receipt.status).toBe("failed");
  expect(service.stopSession).toHaveBeenCalledExactlyOnceWith("owned-child");
});

it("closes successful sessions exactly once and detaches cancellation", async () => {
  const { service, execute, unsubscribe } = await fixture();
  const controller = new AbortController();
  expect((await execute(controller.signal)).receipt.status).toBe("completed");
  controller.abort();
  expect(service.cancelSession).not.toHaveBeenCalled();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(service.stopSession).toHaveBeenCalledExactlyOnceWith("owned-child");
});

it("preserves a setup failure if shutting down the child also fails", async () => {
  const { service, execute } = await fixture();
  service.onSessionEvent.mockImplementation(() => {
    throw new Error("subscription failed");
  });
  service.stopSession.mockRejectedValue(new Error("shutdown failed"));
  await expect(execute()).rejects.toThrow("subscription failed");
  expect(service.stopSession).toHaveBeenCalledTimes(1);
});
