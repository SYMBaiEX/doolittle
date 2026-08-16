import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: class {},
  app: {
    on: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: () => false,
  },
  clipboard: {},
  dialog: {},
  ipcMain: {},
  Menu: {},
  Notification: class {},
  screen: {},
  shell: {},
  Tray: class {},
}));

import { createSerializedWorkspaceSwitchQueue } from "./index";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("workspace switch serialization", () => {
  it("serializes a native picker result after a recent workspace switch", async () => {
    const enqueue = createSerializedWorkspaceSwitchQueue();
    const recentGate = deferred<void>();
    const pickerGate = deferred<void>();
    const started: string[] = [];
    const completed: string[] = [];
    let persistedWorkspace = "initial";
    let activeSwitches = 0;
    let maxActiveSwitches = 0;

    const switchWorkspace = async (workspace: string, gate: Promise<void>) => {
      started.push(workspace);
      activeSwitches += 1;
      maxActiveSwitches = Math.max(maxActiveSwitches, activeSwitches);
      await gate;
      activeSwitches -= 1;
      persistedWorkspace = workspace;
      completed.push(workspace);
    };

    const recent = enqueue(() =>
      switchWorkspace("/work/recent", recentGate.promise),
    );
    const picker = enqueue(() =>
      switchWorkspace("/work/picked", pickerGate.promise),
    );

    await Promise.resolve();
    expect(started).toEqual(["/work/recent"]);
    expect(maxActiveSwitches).toBe(1);

    recentGate.resolve();
    await recent;
    await Promise.resolve();
    expect(started).toEqual(["/work/recent", "/work/picked"]);
    expect(persistedWorkspace).toBe("/work/recent");

    pickerGate.resolve();
    await picker;
    expect(completed).toEqual(["/work/recent", "/work/picked"]);
    expect(maxActiveSwitches).toBe(1);
    expect(persistedWorkspace).toBe("/work/picked");
  });

  it("continues with a picker result after an earlier workspace switch fails", async () => {
    const enqueue = createSerializedWorkspaceSwitchQueue();
    const started: string[] = [];
    let persistedWorkspace = "initial";

    const failedRecent = enqueue(async () => {
      started.push("/work/recent");
      throw new Error("backend switch failed");
    });
    const picker = enqueue(async () => {
      started.push("/work/picked");
      persistedWorkspace = "/work/picked";
    });

    await expect(failedRecent).rejects.toThrow("backend switch failed");
    await picker;
    expect(started).toEqual(["/work/recent", "/work/picked"]);
    expect(persistedWorkspace).toBe("/work/picked");
  });
});
