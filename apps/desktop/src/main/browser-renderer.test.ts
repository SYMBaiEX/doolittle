import { EventEmitter } from "node:events";
import {
  closeBrowserWorkspaceTab,
  openBrowserWorkspaceTab,
  snapshotBrowserWorkspaceTab,
} from "@elizaos/plugin-browser";
import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: vi.fn() }));

import {
  RENDERED_FACTS_SCRIPT,
  WAIT_FOR_RENDER_SCRIPT,
} from "./browser-render-facts";
import {
  type BrowserRenderBridge,
  startBrowserRenderBridge,
} from "./browser-renderer";

function fakeWindow(options: BrowserWindowConstructorOptions) {
  let destroyed = false;
  const contents = Object.assign(new EventEmitter(), {
    session: Object.assign(new EventEmitter(), {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      webRequest: { onBeforeRequest: vi.fn() },
    }),
    getTitle: () => "Private fixture",
    setWindowOpenHandler: vi.fn(),
    executeJavaScript: vi.fn(async (script: string) =>
      script === WAIT_FOR_RENDER_SCRIPT
        ? undefined
        : { viewport: { width: options.width, height: options.height } },
    ),
    capturePage: vi.fn(async () => ({
      toPNG: () => Buffer.from("synthetic-test-only-png"),
    })),
  });
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    loadURL: vi.fn(async () => undefined),
    isDestroyed: () => destroyed,
    destroy: vi.fn(() => {
      destroyed = true;
      window.emit("closed");
    }),
  });
  return window;
}

describe("private rendered-page bridge", () => {
  let bridge: BrowserRenderBridge | undefined;
  afterEach(async () => {
    await bridge?.dispose();
    bridge = undefined;
    vi.useRealTimers();
  });

  async function setup(
    isManagedAppUrl = vi.fn(async () => true),
    createWindow?: (options: BrowserWindowConstructorOptions) => BrowserWindow,
  ) {
    const windows: ReturnType<typeof fakeWindow>[] = [];
    const optionsSeen: BrowserWindowConstructorOptions[] = [];
    bridge = await startBrowserRenderBridge({
      isManagedAppUrl,
      createWindow:
        createWindow ??
        ((options) => {
          optionsSeen.push(options);
          const window = fakeWindow(options);
          windows.push(window);
          return window as unknown as BrowserWindow;
        }),
    });
    const environment = bridge.environment;
    const base = environment.ELIZA_BROWSER_WORKSPACE_URL as string;
    const headers = {
      authorization: `Bearer ${environment.ELIZA_BROWSER_WORKSPACE_TOKEN}`,
      "content-type": "application/json",
    };
    const request = (path: string, init: RequestInit = {}) =>
      fetch(`${base}${path}`, {
        ...init,
        headers: { ...headers, ...init.headers },
      });
    const open = (
      body: Record<string, unknown> = { url: "http://localhost:3000/" },
    ) => request("/tabs", { method: "POST", body: JSON.stringify(body) });
    return { windows, optionsSeen, request, open, environment, base };
  }

  it("uses the actual public SDK protocol and closes its private owned window", async () => {
    const { windows, optionsSeen, environment, request } = await setup();
    const tab = await openBrowserWorkspaceTab(
      { url: "http://localhost:3000/", width: 390, height: 844, show: false },
      environment,
    );
    expect(optionsSeen[0]).toMatchObject({
      width: 390,
      height: 844,
      show: false,
      useContentSize: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        devTools: false,
      },
    });
    expect(optionsSeen[0].webPreferences?.partition).not.toContain("persist:");
    const result = await snapshotBrowserWorkspaceTab(tab.id, environment);
    expect(result).toMatchObject({
      captureMode: "rendered-page",
      captureProtocol: "doolittle-rendered-page-v1",
      scope: "viewport-only-read-only",
      data: Buffer.from("synthetic-test-only-png").toString("base64"),
    });
    expect(
      windows[0].webContents.executeJavaScript.mock.calls.map(
        (call) => call[0],
      ),
    ).toEqual([WAIT_FOR_RENDER_SCRIPT, RENDERED_FACTS_SCRIPT]);
    expect(windows[0].webContents.capturePage).toHaveBeenCalledWith(undefined, {
      stayHidden: true,
      stayAwake: false,
    });
    expect(await closeBrowserWorkspaceTab(tab.id, environment)).toBe(true);
    expect(windows[0].destroy).toHaveBeenCalledOnce();
    expect(await (await request("/tabs")).json()).toMatchObject({ tabs: [] });
  });

  it("requires its ephemeral bearer and rejects browser-origin access", async () => {
    const { base, request, windows } = await setup();
    expect((await fetch(`${base}/tabs`)).status).toBe(403);
    expect(
      (
        await request("/tabs", {
          headers: { authorization: "Bearer incorrect" },
        })
      ).status,
    ).toBe(403);
    expect(
      (await request("/tabs", { headers: { origin: "http://localhost:3000" } }))
        .status,
    ).toBe(403);
    expect(
      (await request("/tabs", { headers: { "sec-fetch-site": "same-site" } }))
        .status,
    ).toBe(403);
    expect(windows).toHaveLength(0);
  });

  it.each([
    { url: "https://example.com" },
    { url: "http://127.0.0.1:3000", show: true },
    { url: "http://localhost:3000", partition: "persist:real-user" },
    { url: "http://localhost:3000", connectorAccountId: "account" },
    { url: "http://localhost:3000", width: 90000 },
  ])("rejects expanded capture authority %j", async (body) => {
    const { open, windows } = await setup();
    expect((await open(body)).status).toBe(400);
    expect(windows).toHaveLength(0);
  });

  it("denies unmanaged apps, oversized bodies and every arbitrary eval/input endpoint", async () => {
    const { open, request, windows } = await setup(vi.fn(async () => false));
    expect((await open()).status).toBe(403);
    expect(
      (
        await request("/tabs", {
          method: "POST",
          body: JSON.stringify({
            url: "http://localhost:3000",
            extra: "x".repeat(9000),
          }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/tabs/11111111-1111-4111-8111-111111111111/eval", {
          method: "POST",
          body: JSON.stringify({ script: "arbitrary()" }),
        })
      ).status,
    ).toBe(404);
    expect(
      (await request("/clipboard", { method: "POST", body: "{}" })).status,
    ).toBe(404);
    expect(windows).toHaveLength(0);
  });

  it("enforces paired permission denial and the resource policy", async () => {
    const { open, windows } = await setup();
    await open();
    const { session } = windows[0].webContents;
    const permissionReply = vi.fn();
    session.setPermissionRequestHandler.mock.calls[0][0](
      null,
      "camera",
      permissionReply,
    );
    expect(permissionReply).toHaveBeenCalledWith(false);
    expect(session.setPermissionCheckHandler.mock.calls[0][0]()).toBe(false);
    const denyDownload = { preventDefault: vi.fn() };
    session.emit("will-download", denyDownload);
    expect(denyDownload.preventDefault).toHaveBeenCalledOnce();
    const resourceReply = vi.fn();
    session.webRequest.onBeforeRequest.mock.calls[0][1](
      {
        url: "http://127.0.0.1:9000/private",
        method: "GET",
        resourceType: "xhr",
      },
      resourceReply,
    );
    expect(resourceReply).toHaveBeenCalledWith({ cancel: true });
    const event = { preventDefault: vi.fn() };
    windows[0].webContents.emit("will-redirect", event, "file:///private");
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("bounds four concurrent private windows and disposal is idempotent", async () => {
    const { open, windows } = await setup();
    for (let i = 0; i < 4; i++) expect((await open()).status).toBe(200);
    expect((await open()).status).toBe(429);
    await bridge?.dispose();
    await bridge?.dispose();
    expect(windows).toHaveLength(4);
    expect(windows.every((window) => window.isDestroyed())).toBe(true);
  });

  it("rechecks the capacity after asynchronous managed-app authorization", async () => {
    let release: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { open, windows } = await setup(
      vi.fn(async () => {
        await barrier;
        return true;
      }),
    );
    const pending = Array.from({ length: 6 }, () => open());
    release();
    const statuses = (await Promise.all(pending)).map(
      (response) => response.status,
    );
    expect(statuses.filter((status) => status === 200)).toHaveLength(4);
    expect(statuses.filter((status) => status === 429)).toHaveLength(2);
    expect(windows).toHaveLength(4);
  });

  it("revokes stale workspace authority before capturing any pixels", async () => {
    const managed = vi.fn(async () => true);
    const { open, request, windows } = await setup(managed);
    const { tab } = await (await open()).json();
    managed.mockResolvedValue(false);
    expect((await request(`/tabs/${tab.id}/snapshot`)).status).toBe(403);
    expect(windows[0].webContents.capturePage).not.toHaveBeenCalled();
    expect(windows[0].isDestroyed()).toBe(true);
  });

  it("cleans up failures during permission setup", async () => {
    let failed: ReturnType<typeof fakeWindow> | undefined;
    const { open, request } = await setup(undefined, (options) => {
      failed = fakeWindow(options);
      failed.webContents.session.setPermissionRequestHandler.mockImplementationOnce(
        () => {
          throw new Error("private setup failure");
        },
      );
      return failed as unknown as BrowserWindow;
    });
    expect((await open()).status).toBe(502);
    expect(failed?.isDestroyed()).toBe(true);
    expect(await (await request("/tabs")).json()).toMatchObject({ tabs: [] });
  });

  it("cleans up a failed managed-app load without retaining a private tab", async () => {
    let failed: ReturnType<typeof fakeWindow> | undefined;
    const { open, request } = await setup(undefined, (options) => {
      failed = fakeWindow(options);
      failed.loadURL.mockRejectedValueOnce(new Error("private load failure"));
      return failed as unknown as BrowserWindow;
    });
    expect((await open()).status).toBe(502);
    expect(failed?.isDestroyed()).toBe(true);
    expect(await (await request("/tabs")).json()).toMatchObject({ tabs: [] });
  });

  it("revalidates workspace authority after native pixels are captured", async () => {
    const managed = vi.fn(async () => true);
    const { open, request, windows } = await setup(managed);
    const { tab } = await (await open()).json();
    windows[0].webContents.capturePage.mockImplementationOnce(async () => {
      managed.mockResolvedValue(false);
      return { toPNG: () => Buffer.from("private revoked pixels") };
    });
    const response = await request(`/tabs/${tab.id}/snapshot`);
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("data");
    expect(windows[0].isDestroyed()).toBe(true);
  });

  it("does not create a window after disposal interrupts pending authorization", async () => {
    let release: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const managed = vi.fn(async () => {
      await barrier;
      return true;
    });
    const { open, windows } = await setup(managed);
    const pending = open().catch(() => undefined);
    await vi.waitFor(() => expect(managed).toHaveBeenCalledOnce());
    await bridge?.dispose();
    release();
    await pending;
    expect(windows).toHaveLength(0);
  });

  it("expires an abandoned private tab within the bounded lifetime", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { open, request, windows } = await setup();
    const { tab } = await (await open()).json();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(windows[0].isDestroyed()).toBe(true);
    expect((await request(`/tabs/${tab.id}/snapshot`)).status).toBe(404);
  });

  it("destroys a window when native capture stalls past its operation bound", async () => {
    const { open, request, windows } = await setup();
    const { tab } = await (await open()).json();
    windows[0].webContents.executeJavaScript.mockImplementationOnce(
      () => new Promise(() => {}),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = request(`/tabs/${tab.id}/snapshot`);
    await vi.waitFor(() =>
      expect(windows[0].webContents.executeJavaScript).toHaveBeenCalledOnce(),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).status).toBe(502);
    expect(windows[0].isDestroyed()).toBe(true);
    expect(await (await request("/tabs")).json()).toMatchObject({ tabs: [] });
  });

  it("rejects overlapping snapshots of a tab and cleans it on pixel failure", async () => {
    const { open, request, windows } = await setup();
    const { tab } = await (await open()).json();
    let release: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    windows[0].webContents.executeJavaScript.mockImplementationOnce(
      async () => {
        await barrier;
      },
    );
    const first = request(`/tabs/${tab.id}/snapshot`);
    await vi.waitFor(() =>
      expect(windows[0].webContents.executeJavaScript).toHaveBeenCalledOnce(),
    );
    expect((await request(`/tabs/${tab.id}/snapshot`)).status).toBe(409);
    windows[0].webContents.capturePage.mockRejectedValueOnce(
      new Error("private error"),
    );
    release();
    expect((await first).status).toBe(502);
    expect(windows[0].isDestroyed()).toBe(true);
  });
});
