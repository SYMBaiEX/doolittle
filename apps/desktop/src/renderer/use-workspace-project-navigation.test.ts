import { describe, expect, it, vi } from "vitest";
import {
  createWorkspaceTransitionCoordinator,
  runWorkspaceRequest,
} from "./use-workspace-project-navigation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("workspace transition coordinator", () => {
  it("ignores stale async workspace results and balances request counters", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const first = deferred<string>();
    const second = deferred<string>();
    const committed: string[] = [];

    const firstRequest = runWorkspaceRequest({
      coordinator,
      operation: () => first.promise,
      onCurrent: (result) => committed.push(result),
    });
    expect(coordinator.snapshot()).toEqual({
      current: 1,
      inFlight: 1,
      pendingScope: null,
    });

    const secondRequest = runWorkspaceRequest({
      coordinator,
      operation: () => second.promise,
      onCurrent: (result) => committed.push(result),
    });
    expect(coordinator.snapshot()).toEqual({
      current: 2,
      inFlight: 2,
      pendingScope: null,
    });

    second.resolve("second");
    await expect(secondRequest).resolves.toMatchObject({
      current: true,
      result: "second",
      transition: 2,
    });
    expect(committed).toEqual(["second"]);
    expect(coordinator.snapshot().inFlight).toBe(1);

    first.resolve("first");
    await expect(firstRequest).resolves.toMatchObject({
      current: false,
      result: "first",
      transition: 1,
    });
    expect(committed).toEqual(["second"]);
    expect(coordinator.snapshot().inFlight).toBe(0);
  });

  it("shares a parent project transition without advancing its generation", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const transition = coordinator.begin("project-a");
    const operation = vi.fn(async () => "workspace-a");
    const onCurrent = vi.fn();

    await expect(
      runWorkspaceRequest({
        coordinator,
        operation,
        onCurrent,
        transition,
      }),
    ).resolves.toMatchObject({ current: true, transition });

    expect(coordinator.snapshot()).toEqual({
      current: transition,
      inFlight: 0,
      pendingScope: "project-a",
    });
    expect(onCurrent).toHaveBeenCalledWith("workspace-a");

    coordinator.clearPending(transition);
    expect(coordinator.snapshot().pendingScope).toBeNull();
  });

  it("balances the in-flight counter when a native request rejects", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const failure = new Error("picker failed");

    await expect(
      runWorkspaceRequest({
        coordinator,
        operation: async () => {
          throw failure;
        },
        onCurrent: vi.fn(),
      }),
    ).rejects.toBe(failure);

    expect(coordinator.snapshot()).toEqual({
      current: 1,
      inFlight: 0,
      pendingScope: null,
    });
  });
});
