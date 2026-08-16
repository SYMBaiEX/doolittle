import { describe, expect, it, vi } from "vitest";
import {
  type ConfigurableUpdateProvider,
  configureUpdateProvider,
  DesktopUpdateController,
  type UpdateProvider,
} from "./update-state";

function provider() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const value = {
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn(),
    on: (event: string, listener: (...args: never[]) => void) => {
      listeners.set(event, listener as (...args: unknown[]) => void);
    },
  } as UpdateProvider;
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

  it("accepts only one install request after an update is downloaded", () => {
    const mock = provider();
    const updates = new DesktopUpdateController(mock.value, "Unavailable");
    mock.emit("update-downloaded", { version: "1.2.0" });

    updates.install();
    updates.install();

    expect(mock.value.quitAndInstall).toHaveBeenCalledOnce();
  });

  it("allows a later downloaded update after an asynchronous installer error", () => {
    const mock = provider();
    const updates = new DesktopUpdateController(mock.value, "Unavailable");
    mock.emit("update-downloaded", { version: "1.2.0" });

    updates.install();
    mock.emit("error", new Error("native updater failed"));
    mock.emit("update-downloaded", { version: "1.2.1" });
    updates.install();

    expect(mock.value.quitAndInstall).toHaveBeenCalledTimes(2);
    expect(updates.getState()).toMatchObject({
      phase: "downloaded",
      version: "1.2.1",
    });
  });

  it("allows install retry when the native restart request throws", () => {
    const mock = provider();
    vi.mocked(mock.value.quitAndInstall).mockImplementation(() => {
      throw new Error("restart failed");
    });
    const updates = new DesktopUpdateController(mock.value, "Unavailable");
    mock.emit("update-downloaded", { version: "1.2.0" });

    expect(() => updates.install()).toThrow("restart failed");
    expect(() => updates.install()).toThrow("restart failed");

    expect(mock.value.quitAndInstall).toHaveBeenCalledTimes(2);
  });

  it("uses embedded publisher metadata unless a generic feed override is configured", () => {
    const value = provider().value as ConfigurableUpdateProvider;
    value.autoDownload = true;
    value.autoInstallOnAppQuit = true;
    value.setFeedURL = vi.fn();

    configureUpdateProvider(value);
    expect(value.autoDownload).toBe(false);
    expect(value.autoInstallOnAppQuit).toBe(false);
    expect(value.setFeedURL).not.toHaveBeenCalled();

    configureUpdateProvider(value, "https://updates.example.test/doolittle");
    expect(value.setFeedURL).toHaveBeenCalledWith({
      provider: "generic",
      url: "https://updates.example.test/doolittle",
    });
  });
});
