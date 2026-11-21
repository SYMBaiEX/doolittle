import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import {
  configuredUpdater,
  DesktopUpdateController,
  type UpdateProvider,
} from "../../apps/desktop/src/main/update-state";

function updateProvider() {
  const events = new EventEmitter();
  return {
    // The controller subscribes without chaining AppUpdater's fluent return.
    on: events.on.bind(events) as UpdateProvider["on"],
    checkForUpdates: vi.fn(async () => {
      events.emit("update-available", { version: "1.0.0" });
      return null;
    }),
    downloadUpdate: vi.fn(async () => {
      events.emit("update-downloaded", { version: "1.0.0" });
      return [];
    }),
    quitAndInstall: vi.fn(),
  };
}

it("loads the packaged updater only on explicit check and retains update events", async () => {
  const provider = updateProvider();
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
  const provider = updateProvider();
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
