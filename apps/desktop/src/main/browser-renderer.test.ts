import { EventEmitter } from "node:events";
import { ServerResponse } from "node:http";
import {
  closeBrowserWorkspaceTab,
  openBrowserWorkspaceTab,
  snapshotBrowserWorkspaceTab,
} from "@elizaos/plugin-browser";
import {
  type BrowserWindow,
  type BrowserWindowConstructorOptions,
  BrowserWindow as ElectronBrowserWindow,
  screen,
} from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: vi.fn(),
  screen: { getPrimaryDisplay: vi.fn(() => ({ scaleFactor: 2 })) },
}));

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
    isOffscreen: () => !!options.webPreferences?.offscreen,
    isDestroyed: () => destroyed,
    setWindowOpenHandler: vi.fn(),
    executeJavaScript: vi.fn(async (script: string) =>
      script === WAIT_FOR_RENDER_SCRIPT
        ? undefined
        : { viewport: { width: options.width, height: options.height } },
    ),
    capturePage: vi.fn(async () => ({
      toPNG: vi.fn(() => Buffer.from("synthetic-test-only-png")),
    })),
  });
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    loadURL: vi.fn(async (url: string) => {
      contents.emit("did-start-navigation", { isMainFrame: true });
      contents.emit("did-navigate", {}, url);
      // Synthetic metadata only; this unit fixture is not native pixel evidence.
      contents.emit(
        "paint",
        {},
        {},
        {
          isEmpty: () => false,
          getSize: () => ({ width: options.width, height: options.height }),
        },
      );
    }),
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
    vi.mocked(ElectronBrowserWindow).mockReset();
    vi.mocked(screen.getPrimaryDisplay).mockClear();
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
    expect(windows[0].webContents.capturePage).toHaveBeenCalledOnce();
    expect(
      (await windows[0].webContents.capturePage.mock.results[0].value).toPNG,
    ).toHaveBeenCalledOnce();
    expect(await closeBrowserWorkspaceTab(tab.id, environment)).toBe(true);
    expect(windows[0].destroy).toHaveBeenCalledOnce();
    expect(await (await request("/tabs")).json()).toMatchObject({ tabs: [] });
  });

  it("uses the real default constructor policy and disposes its only owned window", async () => {
    let constructorOptions: BrowserWindowConstructorOptions | undefined;
    let window: ReturnType<typeof fakeWindow> | undefined;
    vi.mocked(ElectronBrowserWindow).mockImplementation(
      function MockCaptureWindow(options?: BrowserWindowConstructorOptions) {
        if (!new.target)
          throw new Error("Synthetic window requires construction.");
        constructorOptions = options;
        window = fakeWindow(options ?? {});
        return window as unknown as BrowserWindow;
      },
    );
    bridge = await startBrowserRenderBridge({
      isManagedAppUrl: async () => true,
    });
    const tab = await openBrowserWorkspaceTab(
      { url: "http://localhost:3000/", width: 1280, height: 720 },
      bridge.environment,
    );
    expect(ElectronBrowserWindow).toHaveBeenCalledOnce();
    expect(constructorOptions).toMatchObject({
      width: 1280,
      height: 720,
      useContentSize: true,
      show: false,
      skipTaskbar: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        webviewTag: false,
        backgroundThrottling: false,
        devTools: false,
      },
    });
    expect(constructorOptions?.webPreferences?.partition).toMatch(
      /^doolittle-capture-/,
    );
    expect(constructorOptions?.webPreferences?.partition).not.toContain(
      "persist:",
    );
    expect(constructorOptions?.webPreferences?.offscreen).toEqual(
      process.platform === "linux"
        ? { useSharedTexture: false, deviceScaleFactor: 2 }
        : undefined,
    );
    expect(screen.getPrimaryDisplay).toHaveBeenCalledTimes(
      process.platform === "linux" ? 1 : 0,
    );
    await snapshotBrowserWorkspaceTab(tab.id, bridge.environment);
    expect(
      window?.webContents.executeJavaScript.mock.calls.map(
        ([script]) => script,
      ),
    ).toEqual([WAIT_FOR_RENDER_SCRIPT, RENDERED_FACTS_SCRIPT]);
    expect(window?.webContents.capturePage).toHaveBeenCalledExactlyOnceWith(
      undefined,
      { stayHidden: true, stayAwake: false },
    );
    await bridge.dispose();
    expect(window?.destroy).toHaveBeenCalledOnce();
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

  describe("closed route and method admission", () => {
    const missingId = "11111111-1111-4111-8111-111111111111";
    it.each([
      "/clipboard",
      "/tabs/not-an-id/snapshot",
      "/tabs/11111111-1111-4111-8111-111111111111/eval",
      "/tabs/11111111-1111-4111-8111-111111111111/snapshot/extra",
      "/tabs/11111111-1111-4111-8111-111111111111/snapshot?extra=1",
    ])(
      "rejects malformed or unsupported route %s before native execution",
      async (path) => {
        const managed = vi.fn(async () => true);
        const { open, request, windows } = await setup(managed);
        await open();
        const response = await request(path);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
          error: "Capture operation is not supported.",
        });
        expect(managed).toHaveBeenCalledOnce();
        expect(windows[0].webContents.executeJavaScript).not.toHaveBeenCalled();
        expect(windows[0].webContents.capturePage).not.toHaveBeenCalled();
        expect(windows[0].destroy).not.toHaveBeenCalled();
      },
    );

    it.each(["GET", "DELETE", "POST", "PATCH"])(
      "rejects an absent owned tab before %s method dispatch",
      async (method) => {
        const managed = vi.fn(async () => true);
        const { open, request, windows } = await setup(managed);
        await open();
        for (const suffix of ["", "/snapshot"]) {
          const response = await request(`/tabs/${missingId}${suffix}`, {
            method,
          });
          expect(response.status).toBe(404);
          expect(await response.json()).toEqual({
            error: "Capture tab not found.",
          });
        }
        expect(managed).toHaveBeenCalledOnce();
        expect(windows[0].webContents.executeJavaScript).not.toHaveBeenCalled();
        expect(windows[0].webContents.capturePage).not.toHaveBeenCalled();
        expect(windows[0].destroy).not.toHaveBeenCalled();
      },
    );

    it.each([
      {
        suffix: "",
        methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "OPTIONS"],
      },
      {
        suffix: "/snapshot",
        methods: ["DELETE", "HEAD", "POST", "PUT", "PATCH", "OPTIONS"],
      },
    ])(
      "rejects unsupported methods on owned tab path $suffix without revoking the tab",
      async ({ suffix, methods }) => {
        const managed = vi.fn(async () => true);
        const { open, request, windows } = await setup(managed);
        const { tab } = await (await open()).json();
        for (const method of methods) {
          const response = await request(`/tabs/${tab.id}${suffix}`, {
            method,
          });
          expect(response.status).toBe(404);
          if (method !== "HEAD")
            expect(await response.json()).toEqual({
              error: "Capture operation is not supported.",
            });
        }
        expect(managed).toHaveBeenCalledOnce();
        expect(windows[0].webContents.executeJavaScript).not.toHaveBeenCalled();
        expect(windows[0].webContents.capturePage).not.toHaveBeenCalled();
        expect(windows[0].destroy).not.toHaveBeenCalled();
        expect(await (await request("/tabs")).json()).toMatchObject({
          tabs: [{ id: tab.id }],
        });
      },
    );

    it.each(["DELETE", "HEAD", "PUT", "PATCH", "OPTIONS"])(
      "keeps collection method %s unsupported",
      async (method) => {
        const managed = vi.fn(async () => true);
        const { request, windows } = await setup(managed);
        const response = await request("/tabs", { method });
        expect(response.status).toBe(404);
        if (method !== "HEAD")
          expect(await response.json()).toEqual({
            error: "Capture operation is not supported.",
          });
        expect(managed).not.toHaveBeenCalled();
        expect(windows).toHaveLength(0);
      },
    );

    it("admits tab DELETE without capture and preserves the other private owned tab", async () => {
      const { open, request, windows } = await setup();
      const { tab } = await (await open()).json();
      const { tab: other } = await (await open()).json();
      const response = await request(`/tabs/${tab.id}`, { method: "DELETE" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ closed: true });
      expect(windows[0].destroy).toHaveBeenCalledOnce();
      expect(windows[1].destroy).not.toHaveBeenCalled();
      for (const window of windows) {
        expect(window.webContents.executeJavaScript).not.toHaveBeenCalled();
        expect(window.webContents.capturePage).not.toHaveBeenCalled();
      }
      expect(await (await request("/tabs")).json()).toMatchObject({
        tabs: [{ id: other.id }],
      });
    });

    it.each<Record<string, string>>([
      { authorization: "Bearer incorrect" },
      { origin: "http://localhost:3000" },
      { "sec-fetch-site": "same-origin" },
    ])(
      "never admits snapshot execution without bridge authorization %j",
      async (headers) => {
        const managed = vi.fn(async () => true);
        const { open, request, windows } = await setup(managed);
        const { tab } = await (await open()).json();
        expect(
          (await request(`/tabs/${tab.id}/snapshot`, { headers })).status,
        ).toBe(403);
        expect(managed).toHaveBeenCalledOnce();
        expect(windows[0].webContents.executeJavaScript).not.toHaveBeenCalled();
        expect(windows[0].webContents.capturePage).not.toHaveBeenCalled();
        expect(windows[0].destroy).not.toHaveBeenCalled();
      },
    );
    it.each(["unmatched", "unsupported-method"])(
      "preserves cleanup and fixed 400 fallback after a %s denial write fails",
      async (kind) => {
        const managed = vi.fn(async () => true);
        const { open, request, windows } = await setup(managed);
        const { tab } = await (await open()).json();
        const original = ServerResponse.prototype.writeHead;
        let injected = false;
        const writeHead = vi
          .spyOn(ServerResponse.prototype, "writeHead")
          .mockImplementation(function (
            this: ServerResponse,
            ...args: Parameters<ServerResponse["writeHead"]>
          ) {
            if (args[0] === 404 && !injected) {
              injected = true;
              throw new Error("CANARY_PRIVATE_WRITE_FAILURE");
            }
            return Reflect.apply(original, this, args) as ServerResponse;
          });
        try {
          const response = await request(
            kind === "unmatched" ? "/clipboard" : `/tabs/${tab.id}`,
            { method: "GET" },
          );
          expect(response.status).toBe(400);
          expect(await response.json()).toEqual({
            error: "Invalid capture request.",
          });
          expect(writeHead.mock.calls.map(([status]) => status)).toEqual([
            404, 400,
          ]);
          expect(injected).toBe(true);
          expect(managed).toHaveBeenCalledOnce();
          expect(
            windows[0].webContents.executeJavaScript,
          ).not.toHaveBeenCalled();
          expect(windows[0].webContents.capturePage).not.toHaveBeenCalled();
          expect(windows[0].destroy).toHaveBeenCalledTimes(
            kind === "unsupported-method" ? 1 : 0,
          );
          expect(await (await request("/tabs")).json()).toMatchObject({
            tabs: kind === "unsupported-method" ? [] : [{ id: tab.id }],
          });
        } finally {
          writeHead.mockRestore();
        }
      },
    );
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
      return { toPNG: vi.fn(() => Buffer.from("private revoked pixels")) };
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

  describe("Linux product OSR first-frame admission", () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    beforeEach(() =>
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      }),
    );
    afterEach(() => {
      if (platform) Object.defineProperty(process, "platform", platform);
    });

    async function withoutPaint(managed = vi.fn(async () => true)) {
      let window: ReturnType<typeof fakeWindow> | undefined;
      const context = await setup(managed, (options) => {
        const next = fakeWindow(options);
        if (!window) {
          next.loadURL.mockImplementationOnce(async (url) => {
            next.webContents.emit("did-start-navigation", {
              isMainFrame: true,
            });
            next.webContents.emit("did-navigate", {}, url);
          });
          window = next;
        }
        return next as unknown as BrowserWindow;
      });
      const { tab } = await (await context.open()).json();
      if (!window) throw new Error("Synthetic window was not created.");
      return { ...context, tab, window };
    }
    const paint = (window: ReturnType<typeof fakeWindow>) =>
      window.webContents.emit(
        "paint",
        {},
        {},
        { isEmpty: () => false, getSize: () => ({ width: 1280, height: 720 }) },
      );

    it("waits for a genuine metadata event, then runs facts/capture/encoding only once", async () => {
      const { request, tab, window } = await withoutPaint();
      const pending = request(`/tabs/${tab.id}/snapshot`);
      await vi.waitFor(() =>
        expect(window.webContents.executeJavaScript).toHaveBeenCalledOnce(),
      );
      expect(window.webContents.capturePage).not.toHaveBeenCalled();
      window.emit("ready-to-show");
      expect(window.webContents.capturePage).not.toHaveBeenCalled();
      paint(window);
      expect((await pending).status).toBe(200);
      expect(
        window.webContents.executeJavaScript.mock.calls.map(
          ([script]) => script,
        ),
      ).toEqual([WAIT_FOR_RENDER_SCRIPT, RENDERED_FACTS_SCRIPT]);
      expect(window.webContents.capturePage).toHaveBeenCalledExactlyOnceWith(
        undefined,
        { stayHidden: true, stayAwake: false },
      );
      expect(
        (await window.webContents.capturePage.mock.results[0].value).toPNG,
      ).toHaveBeenCalledOnce();
    });

    it("uses one snapshot deadline across WAIT and readiness, with no native capture on refusal", async () => {
      const { request, tab, window } = await withoutPaint();
      let release = () => {};
      window.webContents.executeJavaScript.mockImplementationOnce(
        () =>
          new Promise<undefined>((resolve) => {
            release = () => resolve(undefined);
          }),
      );
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const pending = request(`/tabs/${tab.id}/snapshot`);
      await vi.waitFor(() =>
        expect(window.webContents.executeJavaScript).toHaveBeenCalledOnce(),
      );
      await vi.advanceTimersByTimeAsync(9000);
      release();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);
      const response = await pending;
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: "Rendered evidence could not be captured.",
        phase: "native-readiness",
      });
      expect(window.webContents.capturePage).not.toHaveBeenCalled();
      expect(window.webContents.executeJavaScript).toHaveBeenCalledOnce();
      expect(window.isDestroyed()).toBe(true);
      expect(window.webContents.listenerCount("paint")).toBe(0);
      paint(window);
      expect(window.webContents.capturePage).not.toHaveBeenCalled();
    });

    it.each(["delete", "closed", "crash", "contents-destroyed"])(
      "cancels a pending readiness wait on %s without interfering with another tab",
      async (reason) => {
        const { request, open, tab, window } = await withoutPaint();
        const { tab: other } = await (await open()).json();
        const pending = request(`/tabs/${tab.id}/snapshot`);
        await vi.waitFor(() =>
          expect(window.webContents.executeJavaScript).toHaveBeenCalledOnce(),
        );
        if (reason === "delete")
          await request(`/tabs/${tab.id}`, { method: "DELETE" });
        else if (reason === "closed") window.destroy();
        else
          window.webContents.emit(
            reason === "crash" ? "render-process-gone" : "destroyed",
          );
        expect((await pending).status).toBe(502);
        expect(window.webContents.capturePage).not.toHaveBeenCalled();
        expect(window.webContents.listenerCount("paint")).toBe(0);
        expect((await request(`/tabs/${other.id}/snapshot`)).status).toBe(200);
      },
    );

    it("cancels on client disconnect and disposal, cleaning pending listeners", async () => {
      const { request, tab, window } = await withoutPaint();
      const controller = new AbortController();
      const pending = request(`/tabs/${tab.id}/snapshot`, {
        signal: controller.signal,
      }).catch(() => undefined);
      await vi.waitFor(() =>
        expect(window.webContents.executeJavaScript).toHaveBeenCalledOnce(),
      );
      controller.abort();
      await pending;
      await vi.waitFor(() => expect(window.isDestroyed()).toBe(true));
      expect(window.webContents.capturePage).not.toHaveBeenCalled();
      expect(window.webContents.listenerCount("paint")).toBe(0);
      await bridge?.dispose();
    });

    it("does not capture after ownership is lost during the readiness wait", async () => {
      const managed = vi.fn(async () => true);
      const { request, tab, window } = await withoutPaint(managed);
      const pending = request(`/tabs/${tab.id}/snapshot`);
      await vi.waitFor(() =>
        expect(window.webContents.executeJavaScript).toHaveBeenCalledOnce(),
      );
      managed.mockResolvedValue(false);
      paint(window);
      expect((await pending).status).toBe(502);
      expect(window.webContents.capturePage).not.toHaveBeenCalled();
      expect(window.isDestroyed()).toBe(true);
    });

    it.each(["facts", "capture"])(
      "does not start later native work after ownership is lost during %s",
      async (phase) => {
        const managed = vi.fn(async () => true);
        const { open, request, windows } = await setup(managed);
        const { tab } = await (await open()).json();
        const window = windows[0];
        const image = { toPNG: vi.fn(() => Buffer.from("synthetic")) };
        if (phase === "facts") {
          window.webContents.executeJavaScript.mockImplementation(
            async (script) => {
              if (script === RENDERED_FACTS_SCRIPT)
                managed.mockResolvedValue(false);
            },
          );
        } else
          window.webContents.capturePage.mockImplementationOnce(async () => {
            managed.mockResolvedValue(false);
            return image;
          });
        expect((await request(`/tabs/${tab.id}/snapshot`)).status).toBe(502);
        expect(window.webContents.capturePage).toHaveBeenCalledTimes(
          phase === "facts" ? 0 : 1,
        );
        expect(image.toPNG).not.toHaveBeenCalled();
        expect(window.isDestroyed()).toBe(true);
      },
    );

    it("refuses overlapping readiness waits without unregistering the owner's latch", async () => {
      const { request, tab, window } = await withoutPaint();
      const first = request(`/tabs/${tab.id}/snapshot`);
      await vi.waitFor(() =>
        expect(window.webContents.executeJavaScript).toHaveBeenCalledOnce(),
      );
      expect((await request(`/tabs/${tab.id}/snapshot`)).status).toBe(409);
      expect(window.webContents.listenerCount("paint")).toBe(1);
      paint(window);
      expect((await first).status).toBe(200);
      expect(window.webContents.capturePage).toHaveBeenCalledOnce();
    });

    it("cancels a still-pending operation when the original tab lifetime expires", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const context = await withoutPaint();
      await vi.advanceTimersByTimeAsync(25_000);
      const pending = context.request(`/tabs/${context.tab.id}/snapshot`);
      await vi.waitFor(() =>
        expect(
          context.window.webContents.executeJavaScript,
        ).toHaveBeenCalledOnce(),
      );
      await vi.advanceTimersByTimeAsync(5000);
      expect((await pending).status).toBe(502);
      expect(context.window.webContents.capturePage).not.toHaveBeenCalled();
      expect(context.window.webContents.listenerCount("paint")).toBe(0);
      expect(context.window.isDestroyed()).toBe(true);
    });

    it("rejects replacement navigation during in-flight native work and never encodes its late result", async () => {
      const { open, request, windows } = await setup();
      const { tab } = await (await open()).json();
      const window = windows[0];
      const image = { toPNG: vi.fn(() => Buffer.from("synthetic")) };
      let release = (_image: typeof image) => {};
      window.webContents.capturePage.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const pending = request(`/tabs/${tab.id}/snapshot`);
      await vi.waitFor(() =>
        expect(window.webContents.capturePage).toHaveBeenCalledOnce(),
      );
      window.webContents.emit("did-start-navigation", { isMainFrame: true });
      expect((await pending).status).toBe(502);
      release(image);
      await Promise.resolve();
      expect(image.toPNG).not.toHaveBeenCalled();
      expect(window.isDestroyed()).toBe(true);
    });

    it("cleans the latch on failed load, pending disposal, and tab expiry", async () => {
      let failed: ReturnType<typeof fakeWindow> | undefined;
      const context = await setup(undefined, (options) => {
        failed = fakeWindow(options);
        failed.loadURL.mockRejectedValueOnce(new Error("CANARY_PRIVATE"));
        return failed as unknown as BrowserWindow;
      });
      expect((await context.open()).status).toBe(502);
      expect(failed?.webContents.listenerCount("paint")).toBe(0);
      await bridge?.dispose();
      const { request, tab, window } = await withoutPaint();
      const pending = request(`/tabs/${tab.id}/snapshot`).catch(
        () => undefined,
      );
      await vi.waitFor(() =>
        expect(window.webContents.executeJavaScript).toHaveBeenCalledOnce(),
      );
      await bridge?.dispose();
      await pending;
      expect(window.isDestroyed()).toBe(true);
      expect(window.webContents.listenerCount("paint")).toBe(0);
      expect(window.webContents.capturePage).not.toHaveBeenCalled();
    });

    it("refuses native work if the receiver crashed before snapshot admission", async () => {
      const { request, tab, window } = await withoutPaint();
      window.webContents.emit("render-process-gone");
      expect((await request(`/tabs/${tab.id}/snapshot`)).status).toBe(502);
      expect(window.webContents.executeJavaScript).not.toHaveBeenCalled();
      expect(window.webContents.capturePage).not.toHaveBeenCalled();
      expect(window.webContents.listenerCount("paint")).toBe(0);
      expect(window.isDestroyed()).toBe(true);
    });

    it("cleans partially failed readiness registration without changing another window", async () => {
      let failed: ReturnType<typeof fakeWindow> | undefined;
      const foreign = fakeWindow({});
      const { open, request } = await setup(undefined, (options) => {
        failed = fakeWindow(options);
        const original = failed.webContents.on;
        vi.spyOn(failed.webContents, "on").mockImplementation(function (
          this: EventEmitter,
          event,
          listener,
        ) {
          if (event === "paint") throw new Error("CANARY_PRIVATE");
          return original.call(this, event, listener);
        });
        return failed as unknown as BrowserWindow;
      });
      const response = await open();
      expect(response.status).toBe(502);
      expect(JSON.stringify(await response.json())).not.toContain(
        "CANARY_PRIVATE",
      );
      expect(failed?.webContents.listenerCount("did-navigate")).toBe(0);
      expect(failed?.webContents.listenerCount("did-start-navigation")).toBe(0);
      expect(failed?.isDestroyed()).toBe(true);
      expect(foreign.destroy).not.toHaveBeenCalled();
      expect(await (await request("/tabs")).json()).toMatchObject({ tabs: [] });
    });

    it("cancels pending snapshot authorization before it can start WAIT", async () => {
      const managed = vi.fn(async () => true);
      const { request, tab, window } = await withoutPaint(managed);
      let release = (_value: boolean) => {};
      managed.mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            release = resolve;
          }),
      );
      const pending = request(`/tabs/${tab.id}/snapshot`);
      await vi.waitFor(() => expect(managed).toHaveBeenCalledTimes(2));
      await request(`/tabs/${tab.id}`, { method: "DELETE" });
      expect((await pending).status).toBe(502);
      release(true);
      await Promise.resolve();
      expect(window.webContents.executeJavaScript).not.toHaveBeenCalled();
      expect(window.webContents.capturePage).not.toHaveBeenCalled();
    });

    it.each(["darwin", "win32"])(
      "keeps %s on the existing onscreen path without a paint latch",
      async (platform) => {
        Object.defineProperty(process, "platform", {
          value: platform,
          configurable: true,
        });
        let window: ReturnType<typeof fakeWindow> | undefined;
        const { open, request } = await setup(undefined, (options) => {
          window = fakeWindow(options);
          window.loadURL.mockResolvedValueOnce(undefined);
          return window as unknown as BrowserWindow;
        });
        const { tab } = await (await open()).json();
        expect((await request(`/tabs/${tab.id}/snapshot`)).status).toBe(200);
        expect(window?.webContents.listenerCount("paint")).toBe(0);
        expect(window?.webContents.capturePage).toHaveBeenCalledExactlyOnceWith(
          undefined,
          { stayHidden: true, stayAwake: false },
        );
      },
    );
  });
});
