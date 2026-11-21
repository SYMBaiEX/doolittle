import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import { installUiArtifact } from "../../apps/desktop/src/main/ui-extensions/artifact";
import type { UiExtensionHost } from "../../apps/desktop/src/main/ui-extensions/host";
import { UiInterfaceController } from "../../apps/desktop/src/main/ui-interface-controller";
import { uiInterfaceChannels } from "../../apps/desktop/src/shared/ui-interface";

it("restores only an owned native selection without waiting for engine inventory", async () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-native-selection-"));
  const target = {
    botId: "lead",
    sessionId: "conversation",
    projectId: "project",
  };
  const snapshot = vi.fn(async () => {
    throw new Error("Engine inventory is unavailable");
  });
  const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
  const ownsTarget = vi.fn(async () => true);
  let window: BrowserWindow | null = null;
  const controller = new UiInterfaceController({
    host: {
      getSelected: () => target,
      getSnapshot: snapshot,
    } as unknown as UiExtensionHost,
    artifactRoot: root,
    statePath: join(root, "state.json"),
    extensionPreload: join(root, "preload.js"),
    getWindow: () => window,
    ipcMain: {
      handle: (channel: string, listener: Parameters<IpcMain["handle"]>[1]) =>
        handlers.set(channel, listener),
      removeHandler: vi.fn(),
    } as unknown as IpcMain,
    protocol: { handle: vi.fn(), unhandle: vi.fn() },
    safeMode: false,
    pickArtifactDirectory: async () => undefined,
    confirm: async () => false,
    stopAll: async () => {},
    ownsTarget,
  });
  try {
    await controller.start();
    const frame = {};
    const sender = { mainFrame: frame };
    window = {
      isDestroyed: () => false,
      webContents: sender,
    } as unknown as BrowserWindow;
    const handler = handlers.get(uiInterfaceChannels.selection);
    if (!handler)
      throw new Error("Native selection channel was not registered");
    const event = {
      sender,
      senderFrame: frame,
    } as unknown as IpcMainInvokeEvent;
    const selected = await handler(event);
    expect(selected).toEqual(target);
    expect(selected).not.toBe(target);
    expect(snapshot).not.toHaveBeenCalled();
    ownsTarget.mockResolvedValueOnce(false);
    expect(await handler(event)).toBeUndefined();
    expect(() =>
      handler({ ...event, senderFrame: {} } as IpcMainInvokeEvent),
    ).toThrow("Only the native main window");
  } finally {
    controller.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});

it("serves presentation before loading the verified interface inventory", async () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-interface-state-"));
  const frame = {};
  const send = vi.fn();
  const sender = { mainFrame: frame, send };
  const window = {
    isDestroyed: () => false,
    webContents: sender,
  } as unknown as BrowserWindow;
  let activeWindow: BrowserWindow | null = null;
  const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
  const controller = new UiInterfaceController({
    host: {} as UiExtensionHost,
    artifactRoot: root,
    statePath: join(root, "state.json"),
    extensionPreload: join(root, "preload.js"),
    getWindow: () => activeWindow,
    ipcMain: {
      handle: (channel: string, listener: Parameters<IpcMain["handle"]>[1]) =>
        handlers.set(channel, listener),
      removeHandler: vi.fn(),
    } as unknown as IpcMain,
    protocol: { handle: vi.fn(), unhandle: vi.fn() },
    safeMode: false,
    pickArtifactDirectory: async () => undefined,
    confirm: async () => false,
    stopAll: async () => {},
    ownsTarget: async () => false,
  });
  try {
    const source = join(root, "source");
    const entry = "index.html";
    const contents = "<h1>Fixture</h1>";
    mkdirSync(source);
    writeFileSync(join(source, entry), contents);
    writeFileSync(
      join(source, "manifest.json"),
      JSON.stringify({
        kind: "doolittle.ui-plugin",
        manifestVersion: 1,
        id: "example",
        name: "Example",
        description: "",
        pluginVersion: "1.0.0",
        trustTier: "community-static",
        compatibility: { uiHostMajor: 1, uiPackageMajor: 0 },
        entry,
        assets: [
          {
            path: entry,
            bytes: Buffer.byteLength(contents),
            sha256: createHash("sha256").update(contents).digest("hex"),
          },
        ],
        requestedCapabilities: [],
        contributions: { workspaces: [], panels: [] },
      }),
    );
    const artifact = installUiArtifact(root, source);
    await controller.start();
    activeWindow = window;
    const state = handlers.get(uiInterfaceChannels.state);
    if (!state) throw new Error("Native interface state was not registered");
    const event = {
      sender,
      senderFrame: frame,
    } as unknown as IpcMainInvokeEvent;

    expect(await state(event, "presentation")).toMatchObject({
      mode: "default",
      installed: [],
    });
    expect(send).not.toHaveBeenCalled();
    expect(await state(event)).toMatchObject({
      mode: "default",
      installed: [{ identity: artifact.identity }],
    });
    expect(send).toHaveBeenCalledWith(
      uiInterfaceChannels.stateChanged,
      expect.objectContaining({
        installed: [expect.objectContaining({ identity: artifact.identity })],
      }),
    );
  } finally {
    controller.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});
