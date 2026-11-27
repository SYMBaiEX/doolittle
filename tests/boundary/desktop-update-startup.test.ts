import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import {
  type ConfigurableUpdateProvider,
  configuredUpdater,
  configureUpdateProvider,
  DesktopUpdateController,
  type UpdateProvider,
  updateErrorMessage,
} from "../../apps/desktop/src/main/update-state";

function updateProvider() {
  const events = new EventEmitter();
  const provider = {
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
  return { events, provider };
}

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
  await updates.install();
  await updates.install();
  expect(provider.quitAndInstall).toHaveBeenCalledTimes(1);
});

it("retries after a failed updater load and keeps Linux updates manual", async () => {
  const { provider } = updateProvider();
  const load = vi
    .fn(async () => provider)
    .mockRejectedValueOnce(new Error("Updater unavailable"));
  const updates = new DesktopUpdateController(load, "Unavailable");
  await expect(updates.check()).rejects.toThrow(
    "Doolittle could not check for updates",
  );
  expect(updates.getState()).toMatchObject({
    phase: "error",
    message: "Doolittle could not check for updates. Try again later.",
  });
  expect((await updates.check()).phase).toBe("available");
  expect(load).toHaveBeenCalledTimes(2);
  expect(configuredUpdater("linux")).toBeNull();
});

it("translates offline check failures into human copy", async () => {
  const { events, provider } = updateProvider();
  provider.checkForUpdates.mockImplementationOnce(async () => {
    events.emit("error", new Error("net::ERR_INTERNET_DISCONNECTED"));
    throw new Error("net::ERR_INTERNET_DISCONNECTED");
  });
  const updates = new DesktopUpdateController(
    async () => provider,
    "Unavailable",
  );

  await expect(updates.check()).rejects.toThrow("You appear to be offline");
  expect(updates.getState().message).toBe(
    "You appear to be offline or the connection was interrupted. The update will wait; check again when your connection is back.",
  );
  expect(updates.getState().message).not.toContain("net::");
});

it("translates interrupted downloads instead of exposing network internals", async () => {
  const { events, provider } = updateProvider();
  const updates = new DesktopUpdateController(
    async () => provider,
    "Unavailable",
  );
  await updates.check();
  provider.downloadUpdate.mockImplementationOnce(async () => {
    events.emit("error", new Error("net::ERR_CONNECTION_RESET"));
    throw new Error("net::ERR_CONNECTION_RESET");
  });

  await expect(updates.download()).rejects.toThrow(
    "The connection was interrupted",
  );
  expect(updates.getState().message).toBe(
    "The connection was interrupted before the update finished downloading. The update will wait; download it again when your connection is back.",
  );
  expect(updates.getState().message).not.toContain("ERR_");
});

it("uses safe copy for verification and server failures", () => {
  expect(
    updateErrorMessage(new Error("sha512 checksum mismatch"), "download"),
  ).toBe(
    "The update download failed verification, so Doolittle did not install it. Try downloading it again.",
  );
  expect(updateErrorMessage(new Error("HttpError: 404"), "check")).toBe(
    "The update server returned an unexpected response. Try again later.",
  );
});

it("remembers a completed download across restart without downloading or installing implicitly", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-update-state-"));
  try {
    const statePath = join(directory, "downloaded-update.json");
    const firstProvider = updateProvider().provider;
    const first = new DesktopUpdateController(
      async () => firstProvider,
      "Unavailable",
      { downloadedStatePath: statePath },
    );
    await first.check();
    await first.download();
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({
      version: "1.0.0",
    });

    const secondFixture = updateProvider();
    const second = new DesktopUpdateController(
      async () => secondFixture.provider,
      "Unavailable",
      { downloadedStatePath: statePath },
    );
    await second.check();
    expect(second.getState()).toMatchObject({
      phase: "downloaded",
      version: "1.0.0",
    });
    expect(secondFixture.provider.downloadUpdate).not.toHaveBeenCalled();

    await expect(second.download()).rejects.toThrow("No update is ready");
    expect(secondFixture.provider.downloadUpdate).not.toHaveBeenCalled();

    await second.install();
    expect(secondFixture.provider.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(secondFixture.provider.quitAndInstall).toHaveBeenCalledTimes(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("keeps download and quit installation behind explicit user consent", () => {
  const { provider } = updateProvider();
  const configurable = {
    ...provider,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    setFeedURL: vi.fn(),
  } as ConfigurableUpdateProvider;
  configureUpdateProvider(configurable, "https://updates.example.test");
  expect(configurable.autoDownload).toBe(false);
  expect(configurable.autoInstallOnAppQuit).toBe(false);
  expect(configurable.setFeedURL).toHaveBeenCalledWith({
    provider: "generic",
    url: "https://updates.example.test",
  });
});
