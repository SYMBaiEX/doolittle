import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { UiHostCommand, UiHostEvent } from "@doolittle/contracts/ui-host";
import type {
  BrowserWindow,
  IpcMain,
  IpcMainInvokeEvent,
  Session,
  WebContentsView,
} from "electron";
import { uiAssetMime, type VerifiedUiArtifact } from "./artifact";
import type { CommunityCallContext, UiExtensionHost } from "./host";

export const UI_SCHEME = "doolittle-ui";
export const extensionChannels = {
  snapshot: "doolittle-ui:snapshot",
  dispatch: "doolittle-ui:dispatch",
  subscribe: "doolittle-ui:subscribe",
  unsubscribe: "doolittle-ui:unsubscribe",
  event: "doolittle-ui:event",
} as const;

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

interface SchemeRegistrar {
  registerSchemesAsPrivileged(
    schemes: Array<{
      scheme: string;
      privileges: { standard: boolean; secure: boolean };
    }>,
  ): void;
}

/** Must be called once before app.ready; root owns the lifecycle hook. */
export function registerUiExtensionScheme(protocol: SchemeRegistrar): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: UI_SCHEME, privileges: { standard: true, secure: true } },
  ]);
}

export function resolveUiAssetRequest(
  rawUrl: string,
  artifact: VerifiedUiArtifact,
): { path: string; bytes: Buffer } | undefined {
  // URL parsing normalizes dot segments; reject their raw/encoded spelling first.
  if (
    rawUrl.includes("%") ||
    rawUrl.includes("\\") ||
    rawUrl.includes("?") ||
    rawUrl.includes("#")
  )
    return undefined;
  const prefix = `${UI_SCHEME}://${artifact.manifest.id}/`;
  if (!rawUrl.startsWith(prefix)) return undefined;
  const path = rawUrl.slice(prefix.length);
  if (
    !path ||
    path
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  )
    return undefined;
  const bytes = artifact.assets.get(path);
  return bytes ? { path, bytes } : undefined;
}

export function uiAssetResponse(
  rawUrl: string,
  artifact: VerifiedUiArtifact,
  initiatorOrigin?: string,
): Response {
  const origin = `${UI_SCHEME}://${artifact.manifest.id}`;
  if (initiatorOrigin && initiatorOrigin !== origin)
    return new Response("Forbidden", { status: 403 });
  const asset = resolveUiAssetRequest(rawUrl, artifact);
  if (!asset) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(asset.bytes), {
    status: 200,
    headers: {
      "content-type": uiAssetMime(asset.path),
      "content-security-policy": CSP,
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}

/** Keep the IPC identity check independent of Electron for negative-path tests. */
export function isAuthorizedExtensionSender(
  event: Pick<IpcMainInvokeEvent, "sender" | "senderFrame">,
  contents: WebContentsView["webContents"],
  expectedOrigin: string,
): boolean {
  if (
    event.sender !== contents ||
    !event.senderFrame ||
    event.senderFrame !== contents.mainFrame
  )
    return false;
  try {
    const url = new URL(event.senderFrame.url);
    // WHATWG URL.origin is "null" for custom schemes in Node; compare the
    // explicit scheme/host tuple instead and reject embedded credentials.
    return (
      !url.username &&
      !url.password &&
      `${url.protocol}//${url.host}` === expectedOrigin
    );
  } catch {
    return false;
  }
}

export interface CommunityViewOptions {
  window: BrowserWindow;
  ipcMain: IpcMain;
  host: UiExtensionHost;
  artifact: VerifiedUiArtifact;
  extensionPreload: string;
  /** Host-controlled layout only. No extension-supplied geometry. */
  bounds?: { x: number; y: number; width: number; height: number };
}

/** One active community surface. Never share the native renderer's session. */
export class CommunityUiView {
  private static active?: CommunityUiView;
  private readonly view: WebContentsView;
  private readonly session: Session;
  private readonly origin: string;
  private readonly context: CommunityCallContext;
  private readonly subscriptions = new Map<string, () => void>();
  private readonly onWindowHide = () => this.hide();
  private readonly onWindowClosed = () => this.dispose();
  private disposed = false;

  private constructor(
    private readonly options: CommunityViewOptions,
    session: Session,
    view: WebContentsView,
    generation: number,
  ) {
    this.session = session;
    this.view = view;
    this.origin = `${UI_SCHEME}://${options.artifact.manifest.id}`;
    this.context = {
      artifact: options.artifact.identity,
      generation,
      visible: false,
    };
  }

  static async create(options: CommunityViewOptions): Promise<CommunityUiView> {
    if (options.artifact.manifest.trustTier !== "community-static") {
      throw new Error(
        "Only community-static artifacts may enter the isolated view.",
      );
    }
    CommunityUiView.active?.dispose();
    const electron = await import("electron");
    // No persist: partition; cookies, cache, storage and permissions die with this view.
    const isolatedSession = electron.session.fromPartition(
      `doolittle-ui-${randomUUID()}`,
    );
    const view = new electron.WebContentsView({
      webPreferences: {
        session: isolatedSession,
        preload: resolve(options.extensionPreload),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        webSecurity: true,
        webviewTag: false,
        devTools: false,
      },
    });
    const generation = options.host.activate(options.artifact);
    const hostView = new CommunityUiView(
      options,
      isolatedSession,
      view,
      generation,
    );
    CommunityUiView.active = hostView;
    try {
      hostView.installPolicy();
      hostView.installIpc();
      options.window.contentView.addChildView(view);
      view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      view.setVisible(false);
      await view.webContents.loadURL(
        `${hostView.origin}/${options.artifact.manifest.entry}`,
      );
      if (options.bounds) hostView.setBounds(options.bounds);
      return hostView;
    } catch (error) {
      hostView.dispose();
      throw error;
    }
  }

  get generation(): number {
    return this.context.generation;
  }
  get webContentsId(): number {
    return this.view.webContents.id;
  }

  /** Caller must hide this before native tool/auth/install/approval dialogs. */
  setProtectedDialog(active: boolean): void {
    this.options.host.setProtectedDialog(active);
    if (active) this.hide();
  }

  setBounds(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): void {
    const active = this.options.host.activeArtifact;
    if (
      this.disposed ||
      this.options.host.activationGeneration !== this.context.generation ||
      !active ||
      active.pluginId !== this.context.artifact.pluginId ||
      active.pluginVersion !== this.context.artifact.pluginVersion ||
      active.digest !== this.context.artifact.digest ||
      this.options.host.isProtectedDialog
    )
      return;
    const area = this.options.window.getContentBounds();
    const x = Math.max(0, Math.min(Math.floor(bounds.x), area.width));
    const y = Math.max(0, Math.min(Math.floor(bounds.y), area.height));
    const width = Math.max(
      0,
      Math.min(Math.floor(bounds.width), area.width - x),
    );
    const height = Math.max(
      0,
      Math.min(Math.floor(bounds.height), area.height - y),
    );
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      width < 1 ||
      height < 1 ||
      !this.options.window.isVisible()
    ) {
      this.hide();
      return;
    }
    this.view.setBounds({ x, y, width, height });
    this.view.setVisible(true);
    this.context.visible = true;
    this.options.host.setVisible(true);
  }

  hide(): void {
    if (this.disposed) return;
    this.context.visible = false;
    this.options.host.setVisible(false);
    this.view.setVisible(false);
    this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }

  dispose(): void {
    if (this.disposed) return;
    this.hide();
    this.disposed = true;
    if (CommunityUiView.active === this) CommunityUiView.active = undefined;
    if (
      this.options.host.activationGeneration === this.context.generation &&
      this.options.host.activeArtifact?.digest === this.context.artifact.digest
    )
      this.options.host.deactivate();
    for (const unsubscribe of this.subscriptions.values()) unsubscribe();
    this.subscriptions.clear();
    for (const channel of [
      extensionChannels.snapshot,
      extensionChannels.dispatch,
      extensionChannels.subscribe,
      extensionChannels.unsubscribe,
    ]) {
      this.options.ipcMain.removeHandler(channel);
    }
    this.options.window.removeListener("hide", this.onWindowHide);
    this.options.window.removeListener("closed", this.onWindowClosed);
    this.options.window.contentView.removeChildView(this.view);
    if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
    this.session.protocol.unhandle(UI_SCHEME);
  }

  private installPolicy(): void {
    const contents = this.view.webContents;
    this.session.protocol.handle(UI_SCHEME, (request) => {
      const initiatorOrigin =
        "initiatorOrigin" in request &&
        typeof request.initiatorOrigin === "string"
          ? request.initiatorOrigin
          : undefined;
      return uiAssetResponse(
        request.url,
        this.options.artifact,
        initiatorOrigin,
      );
    });
    this.session.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    this.session.setPermissionCheckHandler(() => false);
    this.session.on("will-download", (event) => event.preventDefault());
    this.session.webRequest.onBeforeRequest(
      { urls: ["<all_urls>"] },
      (details, callback) => {
        const allowed =
          resolveUiAssetRequest(details.url, this.options.artifact) !==
            undefined &&
          ["GET", "HEAD"].includes(details.method) &&
          details.webContentsId === contents.id;
        callback({ cancel: !allowed });
      },
    );
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event) => event.preventDefault());
    contents.on("will-redirect", (event) => event.preventDefault());
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("did-navigate", (_event, url) => {
      if (url !== `${this.origin}/${this.options.artifact.manifest.entry}`)
        this.dispose();
    });
    contents.once("destroyed", () => this.dispose());
    this.options.window.on("hide", this.onWindowHide);
    this.options.window.on("closed", this.onWindowClosed);
  }

  private authorize(event: IpcMainInvokeEvent): void {
    const contents = this.view.webContents;
    if (
      this.disposed ||
      !isAuthorizedExtensionSender(event, contents, this.origin)
    ) {
      throw new Error("Untrusted UI extension frame.");
    }
  }

  private installIpc(): void {
    const ipc = this.options.ipcMain;
    ipc.handle(extensionChannels.snapshot, async (event) => {
      this.authorize(event);
      return this.options.host.getCommunitySnapshot(this.context);
    });
    ipc.handle(
      extensionChannels.dispatch,
      async (event, command: UiHostCommand) => {
        this.authorize(event);
        return this.options.host.dispatchCommunity(this.context, command);
      },
    );
    ipc.handle(extensionChannels.subscribe, (event, after: unknown) => {
      this.authorize(event);
      if (
        after !== undefined &&
        (!Number.isSafeInteger(after) || Number(after) < 0)
      )
        throw new Error("Invalid UI event cursor.");
      if (this.subscriptions.size >= 4)
        throw new Error("UI subscription limit reached.");
      const id = randomUUID();
      const unsubscribe = this.options.host.subscribeCommunity(
        this.context,
        (value: UiHostEvent) => {
          if (!this.view.webContents.isDestroyed())
            this.view.webContents.send(extensionChannels.event, { id, value });
        },
        typeof after === "number" ? after : undefined,
      );
      this.subscriptions.set(id, unsubscribe);
      return id;
    });
    ipc.handle(extensionChannels.unsubscribe, (event, id: unknown) => {
      this.authorize(event);
      if (typeof id !== "string") return;
      this.subscriptions.get(id)?.();
      this.subscriptions.delete(id);
    });
  }
}
