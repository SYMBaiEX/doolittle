import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import {
  AUTOMATIC_UPDATE_CHECK_INTERVAL_MS,
  AUTOMATIC_UPDATE_CHECK_START_DELAY_MS,
  configuredUpdater,
  DesktopUpdateController,
  startAutomaticUpdateChecks,
  type UpdateProvider,
} from "../../apps/desktop/src/main/update-state";

function updateProvider() {
  const events = new EventEmitter();
  const provider = {
    // The controller subscribes without chaining AppUpdater's fluent return.
    on: events.on.bind(events) as UpdateProvider["on"],
    checkForUpdates: vi.fn(async () => {
      events.emit("checking-for-update");
      events.emit("update-available", { version: "1.0.0" });
      return null;
    }),
    downloadUpdate: vi.fn(async () => {
      events.emit("update-downloaded", { version: "1.0.0" });
      return [];
    }),
    quitAndInstall: vi.fn(),
  };
  return { events, provider };
}

afterEach(() => {
  vi.useRealTimers();
});

it("loads the packaged updater only on explicit check and retains update events", async () => {
  const { provider } = updateProvider();
  const load = vi.fn(async () => provider);
  const updates = new DesktopUpdateController(load, "Unavailable");
  const update = vi.fn();
  updates.subscribe(update);

  expect(updates.getState().phase).toBe("idle");
  await expect(updates.download()).rejects.toThrow("No update");
  expect(load).not.toHaveBeenCalled();

  await Promise.all([updates.check(), updates.check()]);
  expect(load).toHaveBeenCalledTimes(1);
  expect(updates.getState()).toMatchObject({
    phase: "available",
    version: "1.0.0",
  });
  expect(update).toHaveBeenCalledWith(updates.getState());
  await updates.download();
  updates.install();
  updates.install();
  expect(provider.quitAndInstall).toHaveBeenCalledTimes(1);
});

it("retries after a failed updater load and keeps Linux updates manual", async () => {
  const { provider } = updateProvider();
  const load = vi
    .fn(async () => provider)
    .mockRejectedValueOnce(new Error("Updater unavailable"));
  const updates = new DesktopUpdateController(load, "Unavailable");
  await expect(updates.check()).rejects.toThrow("Updater unavailable");
  expect(updates.getState()).toMatchObject({
    phase: "error",
    message: "Updater unavailable",
  });
  expect((await updates.check()).phase).toBe("available");
  expect(load).toHaveBeenCalledTimes(2);
  expect(configuredUpdater("linux")).toBeNull();
});

it("keeps a failed download directly retriable without another update check", async () => {
  const { events, provider } = updateProvider();
  provider.downloadUpdate.mockImplementationOnce(async () => {
    events.emit("download-progress", { percent: 42 });
    events.emit("error", new Error("connection reset"));
    throw new Error("connection reset");
  });
  const updates = new DesktopUpdateController(
    async () => provider,
    "Unavailable",
  );

  await updates.check();
  await expect(updates.download()).rejects.toThrow("connection reset");
  expect(updates.getState()).toMatchObject({
    phase: "error",
    version: "1.0.0",
  });

  await expect(updates.download()).resolves.toMatchObject({
    phase: "downloaded",
    version: "1.0.0",
  });
  expect(provider.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(provider.downloadUpdate).toHaveBeenCalledTimes(2);
});

it("checks automatically after startup and on the idle interval", async () => {
  vi.useFakeTimers();
  const { provider } = updateProvider();
  const load = vi.fn(async () => provider);
  const updates = new DesktopUpdateController(load, "Unavailable");
  const dispose = startAutomaticUpdateChecks(updates);

  expect(load).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(AUTOMATIC_UPDATE_CHECK_START_DELAY_MS);
  expect(provider.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(updates.getState().phase).toBe("available");

  await vi.advanceTimersByTimeAsync(AUTOMATIC_UPDATE_CHECK_INTERVAL_MS);
  expect(provider.checkForUpdates).toHaveBeenCalledTimes(2);

  dispose();
  await vi.advanceTimersByTimeAsync(AUTOMATIC_UPDATE_CHECK_INTERVAL_MS);
  expect(provider.checkForUpdates).toHaveBeenCalledTimes(2);
});

it("keeps automatic offline failures quiet and retries on the next interval", async () => {
  vi.useFakeTimers();
  const { events, provider } = updateProvider();
  provider.checkForUpdates.mockImplementationOnce(async () => {
    events.emit("checking-for-update");
    events.emit("error", new Error("net::ERR_INTERNET_DISCONNECTED"));
    throw new Error("net::ERR_INTERNET_DISCONNECTED");
  });
  const updates = new DesktopUpdateController(
    async () => provider,
    "Unavailable",
  );
  const phases: string[] = [];
  updates.subscribe((state) => phases.push(state.phase));
  const dispose = startAutomaticUpdateChecks(updates);

  await vi.advanceTimersByTimeAsync(AUTOMATIC_UPDATE_CHECK_START_DELAY_MS);
  expect(updates.getState()).toEqual({
    phase: "idle",
    message: "Check for updates when you are ready.",
  });
  expect(phases).not.toContain("error");

  await vi.advanceTimersByTimeAsync(AUTOMATIC_UPDATE_CHECK_INTERVAL_MS);
  expect(provider.checkForUpdates).toHaveBeenCalledTimes(2);
  expect(updates.getState().phase).toBe("available");
  dispose();
});
