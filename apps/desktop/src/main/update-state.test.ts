import { describe, expect, it, vi } from "vitest";
import { DesktopUpdateController, type UpdateProvider } from "./update-state";

function provider() {
  const listeners = new Map<string, (...args: any[]) => void>();
  const value: UpdateProvider = {
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn(),
    on: (event, listener) => {
      listeners.set(event, listener);
    },
  };
  return {
    value,
    emit: (event: string, payload?: unknown) => listeners.get(event)?.(payload),
  };
}
describe("desktop updates", () => {
  it("maps available, progress, downloaded, and error states without auto-downloading", async () => {
    const mock = provider();
    const updates = new DesktopUpdateController(mock.value, "Unavailable");
    mock.emit("update-available", { version: "1.2.0" });
    expect(updates.getState().phase).toBe("available");
    await updates.download();
    expect(mock.value.downloadUpdate).toHaveBeenCalledOnce();
    mock.emit("download-progress", { percent: 42.4 });
    expect(updates.getState()).toMatchObject({
      phase: "downloading",
      progress: 42,
    });
    mock.emit("update-downloaded", { version: "1.2.0" });
    updates.install();
    expect(mock.value.quitAndInstall).toHaveBeenCalledOnce();
    mock.emit("error", new Error("network unavailable"));
    expect(updates.getState()).toMatchObject({
      phase: "error",
      message: "network unavailable",
    });
  });
});
