import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UiTarget } from "@doolittle/contracts/ui-host";
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import {
  UiExtensionHost,
  type UiHostBackend,
} from "../../apps/desktop/src/main/ui-extensions/host";
import { UiInterfaceController } from "../../apps/desktop/src/main/ui-interface-controller";
import { uiInterfaceChannels } from "../../apps/desktop/src/shared/ui-interface";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

it("rejects dispatch during a protected dialog but accepts the same command after it closes", async () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-ui-dispatch-"));
  roots.push(root);
  const target: UiTarget = { botId: "bot-1", sessionId: "session-1" };
  const backend: UiHostBackend = {
    getSnapshot: vi.fn(async () => ({
      version: 1 as const,
      revision: 0,
      sequence: 0,
      bots: [],
      conversations: [],
    })),
    currentWorkspace: () => "/workspace",
    ownsTarget: vi.fn(async () => true),
    createConversation: vi.fn(async () => target),
    readTranscript: vi.fn(async () => ({ messages: [] })),
    readRun: vi.fn(async () => undefined),
    sendChat: vi.fn(),
    stopRun: vi.fn(),
    pickAttachments: vi.fn(async () => []),
    openSurface: vi.fn(),
    presentApproval: vi.fn(),
  };
  const host = new UiExtensionHost(backend, join(root, "host-state.json"));
  const frame = {};
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: frame,
    isDestroyed: () => false,
    send: vi.fn(),
  });
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    webContents: contents,
    getContentBounds: () => ({ width: 800, height: 600 }),
  }) as unknown as BrowserWindow;
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const controller = new UiInterfaceController({
    host,
    artifactRoot: join(root, "artifacts"),
    statePath: join(root, "selection.json"),
    extensionPreload: join(root, "preload.cjs"),
    getWindow: () => window,
    ipcMain: {
      handle: (channel: string, listener: (...args: unknown[]) => unknown) =>
        handlers.set(channel, listener),
      removeHandler: (channel: string) => handlers.delete(channel),
    } as unknown as IpcMain,
    protocol: { handle: vi.fn(), unhandle: vi.fn() },
    safeMode: false,
    pickArtifactDirectory: async () => undefined,
    confirm: async () => false,
    stopAll: async () => undefined,
    ownsTarget: backend.ownsTarget,
  });
  try {
    await controller.start();
    const dispatch = handlers.get(uiInterfaceChannels.dispatch);
    if (!dispatch) throw new Error("UI dispatch channel was not registered.");
    const event = {
      sender: contents,
      senderFrame: frame,
    } as unknown as IpcMainInvokeEvent;
    const command = { type: "conversation.select", target };

    let closeDialog!: () => void;
    const protectedDialog = controller.withProtectedDialog(
      () =>
        new Promise<void>((resolve) => {
          closeDialog = resolve;
        }),
    );
    expect(host.isProtectedDialog).toBe(true);
    await expect(dispatch(event, command)).rejects.toThrow(/protected dialog/u);
    expect(host.getSelected()).toBeUndefined();

    closeDialog();
    await protectedDialog;
    expect(host.isProtectedDialog).toBe(false);
    await expect(dispatch(event, command)).resolves.toMatchObject({
      accepted: true,
      target,
    });
    expect(host.getSelected()).toEqual(target);
  } finally {
    controller.dispose();
  }
});
