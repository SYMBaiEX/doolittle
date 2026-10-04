import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { UiTarget } from "@doolittle/contracts/ui-host";
import type { BrowserWindow, IpcMain } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { uiInterfaceChannels } from "../shared/ui-interface";
import { installUiArtifact } from "./ui-extensions/artifact";
import { UiExtensionHost, type UiHostBackend } from "./ui-extensions/host";
import { UiInterfaceController } from "./ui-interface-controller";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const target: UiTarget = { botId: "bot-1", sessionId: "session-1" };

function setup(
  tier: "community-static" | "trusted-react" = "community-static",
  safeMode = false,
) {
  const root = mkdtempSync(resolve(tmpdir(), "doolittle-ui-controller-"));
  roots.push(root);
  const source = resolve(root, "source");
  mkdirSync(source);
  const entry = tier === "trusted-react" ? "bundle.js" : "index.html";
  const bytes = Buffer.from(
    tier === "trusted-react"
      ? "export function createRenderer(){ return () => null; }"
      : "<h1>Interface</h1>",
  );
  writeFileSync(resolve(source, entry), bytes);
  writeFileSync(
    resolve(source, "manifest.json"),
    JSON.stringify({
      kind: "doolittle.ui-plugin",
      manifestVersion: 1,
      id: "test-ui",
      name: "Test UI",
      description: "",
      pluginVersion: "1.0.0",
      trustTier: tier,
      compatibility: { uiHostMajor: 1, uiPackageMajor: 0 },
      entry,
      assets: [
        {
          path: entry,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          bytes: bytes.length,
        },
      ],
      requestedCapabilities: ["conversation.read", "message.send"],
      contributions: { workspaces: [], panels: [] },
    }),
  );
  const artifactRoot = resolve(root, "installed");
  const artifact = installUiArtifact(artifactRoot, source);
  const backend: UiHostBackend = {
    getSnapshot: vi.fn(async () => ({
      version: 1,
      revision: 1,
      sequence: 0,
      bots: [
        { id: target.botId, name: "One", isDefault: true, state: "ready" },
      ],
      conversations: [{ ...target, title: "First", state: "ready" }],
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
  const host = new UiExtensionHost(backend, resolve(root, "host.json"));
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    send: vi.fn(),
  });
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => false,
    getContentBounds: () => ({ width: 1000, height: 800 }),
  }) as unknown as BrowserWindow;
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  } as unknown as IpcMain;
  const protocol = { handle: vi.fn(), unhandle: vi.fn() };
  const community = {
    generation: 0,
    setProtectedDialog: vi.fn(),
    setBounds: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  };
  const confirm = vi.fn(async () => true);
  const stopAll = vi.fn(async () => undefined);
  const statePath = resolve(root, "selection.json");
  const controller = new UiInterfaceController({
    host,
    artifactRoot,
    statePath,
    extensionPreload: "/native/preload.cjs",
    getWindow: () => window,
    ipcMain,
    protocol,
    safeMode,
    pickArtifactDirectory: vi.fn(async () => source),
    confirm,
    stopAll,
    ownsTarget: backend.ownsTarget,
    createCommunity: vi.fn(async (value) => {
      community.generation = host.activate(value);
      return community;
    }),
  });
  return {
    root,
    artifact,
    backend,
    host,
    window,
    contents,
    handlers,
    protocol,
    community,
    confirm,
    stopAll,
    statePath,
    controller,
  };
}

describe("native interface consent and recovery", () => {
  it("requires explicit full-application trust for the exact trusted artifact", async () => {
    const { controller, confirm, artifact } = setup("trusted-react");
    await controller.start();
    expect(
      (await controller.activate({ identity: artifact.identity })).mode,
    ).toBe("trusted-react");
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.stringContaining("NOT sandboxed"),
      }),
    );
    const url = controller.getState().entryUrl ?? "";
    expect(controller.trustedAsset(url).status).toBe(200);
    expect(
      controller.trustedAsset(
        url.replace(artifact.identity.digest, "b".repeat(64)),
      ).status,
    ).toBe(403);
    expect(controller.trustedAsset(`${url}/../bundle.js`).status).toBe(404);
    expect(controller.trustedAsset(`${url}?x=1`).status).toBe(403);
    controller.restoreDefault();
    expect(controller.trustedAsset(url).status).toBe(403);
    controller.dispose();
  });

  it("hides the community view during protected dialogs and restores without canceling", async () => {
    const { controller, artifact, community, backend, stopAll } = setup();
    await controller.start();
    await controller.activate({
      identity: artifact.identity,
      capabilities: ["conversation.read"],
      targets: [target],
    });
    expect(community.setBounds).toHaveBeenCalledWith({
      x: 0,
      y: 56,
      width: 1000,
      height: 744,
    });
    await controller.withProtectedDialog(async () => {
      expect(community.setProtectedDialog).toHaveBeenLastCalledWith(true);
      await controller.withProtectedDialog(async () => undefined);
      expect(community.setProtectedDialog).toHaveBeenLastCalledWith(true);
    });
    expect(community.setProtectedDialog).toHaveBeenLastCalledWith(false);
    controller.restoreDefault();
    expect(community.dispose).toHaveBeenCalledOnce();
    expect(backend.stopRun).not.toHaveBeenCalled();
    expect(stopAll).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("invalidates native consent when the workspace changes mid-approval", async () => {
    const { controller, artifact, confirm, community } = setup();
    await controller.start();
    let allow!: (value: boolean) => void;
    confirm.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolveConsent) => {
          allow = resolveConsent;
        }),
    );
    const activation = controller.activate({
      identity: artifact.identity,
      capabilities: ["message.send"],
      targets: [target],
    });
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    controller.workspaceChanged();
    allow(true);
    await expect(activation).rejects.toThrow(/revoked/u);
    expect(controller.getState().mode).toBe("default");
    expect(community.setBounds).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("rejects malformed or duplicate scopes before creating a community view", async () => {
    const { controller, artifact, confirm } = setup();
    await controller.start();
    await expect(
      controller.activate({
        identity: artifact.identity,
        targets: [target, target],
        capabilities: ["message.send"],
      }),
    ).rejects.toThrow(/Duplicate/u);
    await expect(
      controller.activate({
        identity: artifact.identity,
        targets: [null as unknown as UiTarget],
        capabilities: ["message.send"],
      }),
    ).rejects.toThrow(/Invalid conversation/u);
    expect(confirm).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("keeps recovery native and refuses iframe or foreign IPC senders", async () => {
    const { controller, handlers, contents, stopAll } = setup();
    await controller.start();
    const handler = handlers.get(uiInterfaceChannels.stopAll);
    expect(() =>
      handler?.({ sender: {}, senderFrame: contents.mainFrame }),
    ).toThrow(/main window/u);
    expect(() => handler?.({ sender: contents, senderFrame: {} })).toThrow(
      /main window/u,
    );
    await handler?.({ sender: contents, senderFrame: contents.mainFrame });
    expect(stopAll).toHaveBeenCalledOnce();
    controller.dispose();
    expect(handlers.size).toBe(0);
  });

  it("rejects native broker mutations while a protected dialog is active", async () => {
    const { controller, handlers, contents, backend, stopAll } = setup();
    await controller.start();
    const event = { sender: contents, senderFrame: contents.mainFrame };
    await controller.withProtectedDialog(async () => {
      expect(() => handlers.get(uiInterfaceChannels.stopAll)?.(event)).toThrow(
        /protected dialog/u,
      );
      await expect(
        handlers.get(uiInterfaceChannels.dispatch)?.(event, {
          type: "chat.send",
          target,
          submissionId: "hidden",
          message: "hello",
        }),
      ).rejects.toThrow(/protected dialog/u);
    });
    expect(backend.sendChat).not.toHaveBeenCalled();
    expect(stopAll).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("safe mode preserves saved selection but does not execute it", async () => {
    const { controller, artifact, statePath, confirm } = setup(
      "trusted-react",
      true,
    );
    const saved = JSON.stringify({ version: 1, active: artifact.identity });
    writeFileSync(statePath, saved);
    await controller.start();
    expect(controller.getState()).toMatchObject({
      mode: "default",
      safeMode: true,
    });
    expect(readFileSync(statePath, "utf8")).toBe(saved);
    await expect(
      controller.activate({ identity: artifact.identity }),
    ).rejects.toThrow(/safe mode/u);
    expect(readFileSync(statePath, "utf8")).toBe(saved);
    expect(confirm).not.toHaveBeenCalled();
    controller.dispose();
  });
});
