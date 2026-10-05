import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { UiHostCommand, UiTarget } from "@doolittle/contracts/ui-host";
import type { UiPluginArtifactIdentity } from "@doolittle/contracts/ui-plugin";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import type {
  BrowserWindow,
  IpcMain,
  IpcMainInvokeEvent,
  Protocol,
} from "electron";
import {
  type InstalledUiInterface,
  type UiInterfaceActivation,
  type UiInterfaceState,
  uiInterfaceChannels,
} from "../shared/ui-interface";
import {
  installUiArtifact,
  loadUiArtifact,
  uiAssetMime,
  type VerifiedUiArtifact,
} from "./ui-extensions/artifact";
import { CommunityUiView, UI_SCHEME } from "./ui-extensions/community-view";
import type { UiExtensionHost } from "./ui-extensions/host";

interface CommunitySurface {
  generation: number;
  setProtectedDialog(active: boolean): void;
  setBounds(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): void;
  hide(): void;
  dispose(): void;
}

export interface UiInterfaceControllerOptions {
  host: UiExtensionHost;
  artifactRoot: string;
  statePath: string;
  extensionPreload: string;
  getWindow: () => BrowserWindow | null;
  ipcMain: IpcMain;
  protocol: Pick<Protocol, "handle" | "unhandle">;
  safeMode: boolean;
  /** Exact trusted development origin; packaged file:// modules use Origin:null. */
  rendererOrigin?: string;
  commandsDisabled?: boolean;
  initialRecovery?: string;
  pickArtifactDirectory: () => Promise<string | undefined>;
  confirm: (options: {
    title: string;
    message: string;
    detail: string;
    confirmLabel: string;
  }) => Promise<boolean>;
  stopAll: () => Promise<void>;
  ownsTarget: (target: UiTarget) => Promise<boolean>;
  createCommunity?: (
    artifact: VerifiedUiArtifact,
    window: BrowserWindow,
  ) => Promise<CommunitySurface>;
}

function sameIdentity(
  a: UiPluginArtifactIdentity,
  b: UiPluginArtifactIdentity,
): boolean {
  return (
    a.pluginId === b.pluginId &&
    a.pluginVersion === b.pluginVersion &&
    a.digest === b.digest
  );
}

function identity(value: unknown): UiPluginArtifactIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid UI interface identity.");
  const item = value as Partial<UiPluginArtifactIdentity>;
  if (
    typeof item.pluginId !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(item.pluginId) ||
    typeof item.pluginVersion !== "string" ||
    item.pluginVersion.length === 0 ||
    item.pluginVersion.length > 120 ||
    typeof item.digest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(item.digest)
  )
    throw new Error("Invalid UI interface identity.");
  return {
    pluginId: item.pluginId,
    pluginVersion: item.pluginVersion,
    digest: item.digest,
  };
}

function description(artifact: VerifiedUiArtifact): InstalledUiInterface {
  return {
    identity: artifact.identity,
    name: artifact.manifest.name,
    trustTier: artifact.manifest.trustTier,
    requestedCapabilities: [...artifact.manifest.requestedCapabilities],
  };
}

/** The native shell owns consent and recovery. An interface never installs or grants itself. */
export class UiInterfaceController {
  private artifact?: VerifiedUiArtifact;
  private community?: CommunitySurface;
  private protectedDepth = 0;
  private transition = false;
  private recovery?: string;
  private readonly subscriptions = new Map<string, () => void>();
  private readonly onResize = () => this.showCommunity();
  private readonly onHide = () => this.community?.hide();
  private readonly onDestroyed = () => this.clearSubscriptions();
  private registered = false;
  private disposed = false;
  private attachedWindow?: BrowserWindow;
  private activationEpoch = 0;
  private installed?: InstalledUiInterface[];

  constructor(private readonly options: UiInterfaceControllerOptions) {
    this.recovery = options.initialRecovery;
  }

  getState(): UiInterfaceState {
    const artifact = this.artifact;
    return {
      mode: artifact?.manifest.trustTier ?? "default",
      ...(artifact
        ? {
            active: description(artifact),
            ...(artifact.manifest.trustTier === "trusted-react"
              ? { entryUrl: this.entryUrl(artifact) }
              : {}),
          }
        : {}),
      installed: this.listInstalled(),
      safeMode: this.options.safeMode,
      ...(this.recovery ? { recovery: this.recovery } : {}),
    };
  }

  private listInstalled(): InstalledUiInterface[] {
    if (this.installed) return this.installed;
    const directory = resolve(this.options.artifactRoot, "artifacts");
    if (!existsSync(directory)) return [];
    const installed: InstalledUiInterface[] = [];
    let inspected = 0;
    for (const plugin of readdirSync(directory, { withFileTypes: true }).slice(
      0,
      128,
    )) {
      if (
        !plugin.isDirectory() ||
        plugin.isSymbolicLink() ||
        !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(plugin.name)
      )
        continue;
      for (const digest of readdirSync(resolve(directory, plugin.name), {
        withFileTypes: true,
      }).slice(0, 128)) {
        if (++inspected > 128 || installed.length >= 64) break;
        if (
          !digest.isDirectory() ||
          digest.isSymbolicLink() ||
          !/^[a-f0-9]{64}$/u.test(digest.name)
        )
          continue;
        try {
          const manifestPath = resolve(
            directory,
            plugin.name,
            digest.name,
            "manifest.json",
          );
          const stat = lstatSync(manifestPath);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024)
            continue;
          const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
            pluginVersion?: unknown;
          };
          if (typeof manifest.pluginVersion !== "string") continue;
          installed.push(
            description(
              loadUiArtifact(this.options.artifactRoot, {
                pluginId: plugin.name,
                pluginVersion: manifest.pluginVersion,
                digest: digest.name,
              }),
            ),
          );
        } catch {
          /* Corrupt artifacts are not executable and remain recoverable on disk. */
        }
      }
      if (inspected >= 128 || installed.length >= 64) break;
    }
    this.installed = installed;
    return installed;
  }

  async start(): Promise<void> {
    this.registerIpc();
    this.options.protocol.handle(UI_SCHEME, (request) =>
      this.trustedAsset(
        request.url,
        request.headers.get("origin") ?? undefined,
      ),
    );
    const window = this.options.getWindow();
    if (window) this.attachWindow(window);
    if (this.options.safeMode) {
      this.recovery ??=
        "Safe mode is using Doolittle's default interface. Runs and saved data are unchanged.";
      this.emit();
      return;
    }
    if (!existsSync(this.options.statePath)) return;
    try {
      if (lstatSync(this.options.statePath).size > 64 * 1024)
        throw new Error("Invalid interface state.");
      const saved = JSON.parse(
        readFileSync(this.options.statePath, "utf8"),
      ) as { version?: unknown; active?: unknown };
      if (saved.version !== 1) throw new Error("Invalid interface state.");
      if (saved.active) {
        const artifact = loadUiArtifact(
          this.options.artifactRoot,
          identity(saved.active),
        );
        // Community grants require a new activation generation and native consent.
        // Startup never executes community commands with stale approvals.
        if (artifact.manifest.trustTier === "community-static") {
          this.recovery =
            "Re-enable the installed community interface and review its conversation access in Settings.";
        } else {
          this.options.host.trustedRendererSource(artifact);
          this.options.host.activate(artifact);
          this.artifact = artifact;
        }
      }
    } catch {
      this.recovery =
        "An installed interface could not be restored safely. Doolittle is using its default interface; no data was deleted.";
    }
    this.emit();
  }

  attachWindow(window: BrowserWindow): void {
    if (this.attachedWindow === window) return;
    this.attachedWindow?.removeListener("resize", this.onResize);
    this.attachedWindow?.removeListener("show", this.onResize);
    this.attachedWindow?.removeListener("hide", this.onHide);
    this.attachedWindow?.webContents.removeListener(
      "destroyed",
      this.onDestroyed,
    );
    this.clearSubscriptions();
    this.community?.dispose();
    this.community = undefined;
    if (this.artifact?.manifest.trustTier === "community-static") {
      this.options.host.deactivate();
      this.artifact = undefined;
    }
    this.attachedWindow = window;
    window.on("resize", this.onResize);
    window.on("show", this.onResize);
    window.on("hide", this.onHide);
    window.webContents.on("destroyed", this.onDestroyed);
  }

  private entryUrl(artifact: VerifiedUiArtifact): string {
    return `${UI_SCHEME}://trusted/${artifact.identity.digest}/${artifact.manifest.entry}`;
  }

  /** Default session serves only the currently approved, immutable trusted artifact. */
  trustedAsset(rawUrl: string, initiatorOrigin?: string): Response {
    const artifact = this.artifact;
    if (
      artifact?.manifest.trustTier !== "trusted-react" ||
      rawUrl.includes("%") ||
      rawUrl.includes("\\") ||
      rawUrl.includes("?") ||
      rawUrl.includes("#")
    )
      return new Response("Forbidden", { status: 403 });
    const allowedOrigin = this.options.rendererOrigin ?? "null";
    if (initiatorOrigin !== undefined && initiatorOrigin !== allowedOrigin)
      return new Response("Forbidden", { status: 403 });
    const prefix = `${UI_SCHEME}://trusted/${artifact.identity.digest}/`;
    if (!rawUrl.startsWith(prefix))
      return new Response("Forbidden", { status: 403 });
    const path = rawUrl.slice(prefix.length);
    if (path.split("/").some((part) => !part || part === "." || part === ".."))
      return new Response("Not found", { status: 404 });
    this.options.host.trustedRendererSource(artifact);
    const bytes = artifact.assets.get(path);
    return bytes
      ? new Response(new Uint8Array(bytes), {
          headers: {
            "content-type": uiAssetMime(path),
            "x-content-type-options": "nosniff",
            "cache-control": "no-store",
            "access-control-allow-origin": allowedOrigin,
            vary: "Origin",
          },
        })
      : new Response("Not found", { status: 404 });
  }

  async withProtectedDialog<T>(operation: () => Promise<T>): Promise<T> {
    this.beginProtectedDialog();
    try {
      return await operation();
    } finally {
      this.endProtectedDialog();
    }
  }

  withProtectedDialogSync<T>(operation: () => T): T {
    this.beginProtectedDialog();
    try {
      return operation();
    } finally {
      this.endProtectedDialog();
    }
  }

  private beginProtectedDialog(): void {
    this.protectedDepth += 1;
    this.options.host.setProtectedDialog(true);
    this.community?.setProtectedDialog(true);
  }

  private endProtectedDialog(): void {
    this.protectedDepth -= 1;
    if (this.protectedDepth === 0) {
      this.options.host.setProtectedDialog(false);
      this.community?.setProtectedDialog(false);
      this.showCommunity();
    }
  }

  async install(): Promise<UiInterfaceState> {
    return this.exclusive(async () => {
      const directory = await this.withProtectedDialog(
        this.options.pickArtifactDirectory,
      );
      if (directory) installUiArtifact(this.options.artifactRoot, directory);
      this.installed = undefined;
      this.emit();
      return this.getState();
    });
  }

  async activate(request: UiInterfaceActivation): Promise<UiInterfaceState> {
    return this.exclusive(async () => {
      if (!request || typeof request !== "object" || Array.isArray(request))
        throw new Error("Invalid interface activation.");
      const epoch = this.activationEpoch;
      const stillCurrent = () => {
        if (this.disposed || epoch !== this.activationEpoch)
          throw new Error(
            "Interface activation was revoked while awaiting approval.",
          );
      };
      if (this.options.safeMode)
        throw new Error(
          "UI extensions are disabled in startup safe mode. Restart normally to activate one.",
        );
      const artifact = loadUiArtifact(
        this.options.artifactRoot,
        identity(request.identity),
      );
      if (artifact.manifest.trustTier === "trusted-react") {
        let approved = false;
        try {
          this.options.host.trustedRendererSource(artifact);
          approved = true;
        } catch {
          /* Native consent is required. */
        }
        if (!approved) {
          const consent = await this.withProtectedDialog(() =>
            this.options.confirm({
              title: "Trust this application interface?",
              message: `${artifact.manifest.name} ${artifact.manifest.pluginVersion} requires full application trust.`,
              detail: `This React renderer is NOT sandboxed. It can access Doolittle's privileged desktop APIs, conversations, files and authorized agent actions. Approve only code you trust.\n\nArtifact: ${artifact.identity.digest}`,
              confirmLabel: "Trust exact artifact",
            }),
          );
          stillCurrent();
          if (!consent) return this.getState();
          this.options.host.approveTrusted(artifact);
        }
        this.community?.dispose();
        this.community = undefined;
        this.activationEpoch += 1;
        this.options.host.activate(artifact);
        this.artifact = artifact;
      } else {
        const capabilities = request.capabilities ?? [];
        const targets = request.targets ?? [];
        if (
          !Array.isArray(capabilities) ||
          !Array.isArray(targets) ||
          capabilities.length === 0 ||
          capabilities.length > 5 ||
          targets.length === 0 ||
          targets.length > 64 ||
          new Set(capabilities).size !== capabilities.length ||
          capabilities.some(
            (capability) =>
              !artifact.manifest.requestedCapabilities.includes(capability),
          )
        )
          throw new Error(
            "Choose explicit conversation access and requested capabilities before activation.",
          );
        for (const target of targets) {
          if (
            !target ||
            typeof target !== "object" ||
            Array.isArray(target) ||
            typeof target.botId !== "string" ||
            !/^[a-zA-Z0-9:_-]{1,128}$/u.test(target.botId) ||
            typeof target.sessionId !== "string" ||
            !/^[a-zA-Z0-9:_-]{1,128}$/u.test(target.sessionId) ||
            (target.projectId !== undefined &&
              (typeof target.projectId !== "string" ||
                !/^[a-zA-Z0-9:_-]{1,128}$/u.test(target.projectId)))
          )
            throw new Error("Invalid conversation scope.");
          if (!(await this.options.ownsTarget(target)))
            throw new Error("Conversation scope is not owned.");
          stillCurrent();
        }
        if (
          new Set(
            targets.map((target) =>
              JSON.stringify([
                target.botId,
                target.sessionId,
                target.projectId ?? null,
              ]),
            ),
          ).size !== targets.length
        )
          throw new Error("Duplicate conversation scope.");
        const window = this.options.getWindow();
        if (!window || window.isDestroyed())
          throw new Error("The native window is unavailable.");
        this.community?.dispose();
        this.community = undefined;
        this.options.host.deactivate();
        this.artifact = undefined;
        this.community = this.options.createCommunity
          ? await this.options.createCommunity(artifact, window)
          : await CommunityUiView.create({
              window,
              ipcMain: this.options.ipcMain,
              host: this.options.host,
              artifact,
              extensionPreload: this.options.extensionPreload,
            });
        stillCurrent();
        const generation = this.community.generation;
        const snapshot = await this.options.host.getSnapshot();
        stillCurrent();
        const scope = targets
          .map((target) => {
            const bot = snapshot.bots.find((item) => item.id === target.botId);
            const conversation = snapshot.conversations.find(
              (item) =>
                item.botId === target.botId &&
                item.sessionId === target.sessionId &&
                item.projectId === target.projectId,
            );
            if (!bot || !conversation)
              throw new Error("Conversation scope is unavailable.");
            return `${bot.name}: ${conversation.title} (${target.sessionId})`;
          })
          .join("\n");
        const consent = await this.withProtectedDialog(() =>
          this.options.confirm({
            title: "Allow this interface's access?",
            message: `${artifact.manifest.name} ${artifact.manifest.pluginVersion} requests access to these conversations.`,
            detail: `${scope}\n\nCapabilities: ${capabilities.join(", ")}\n\nSending permission lets plugin code initiate authorized agent actions without a prompt each time. Stopping, attachment picking, reading and Computer surfaces require their separate grants. No background commands are allowed.\n\nArtifact: ${artifact.identity.digest}`,
            confirmLabel: "Allow this scope",
          }),
        );
        stillCurrent();
        if (!consent) {
          this.restoreDefault();
          return this.getState();
        }
        await this.options.host.approveCommunity(artifact, {
          artifact: artifact.identity,
          generation,
          capabilities,
          targets,
          approvedAt: new Date().toISOString(),
        });
        stillCurrent();
        this.activationEpoch += 1;
        this.artifact = artifact;
        this.showCommunity();
      }
      this.recovery = undefined;
      this.persistSelection();
      this.emit();
      return this.getState();
    }, true);
  }

  restoreDefault(): UiInterfaceState {
    this.activationEpoch += 1;
    this.community?.dispose();
    this.community = undefined;
    this.artifact = undefined;
    this.recovery = undefined;
    try {
      this.options.host.deactivate();
      this.persistSelection();
    } catch {
      this.recovery =
        "Default interface restored for this launch, but its saved selection could not be updated. Use --safe-ui if restarting before storage is repaired.";
    }
    this.emit();
    return this.getState();
  }

  revoke(value: UiPluginArtifactIdentity): UiInterfaceState {
    const selected = identity(value);
    this.activationEpoch += 1;
    if (
      this.artifact &&
      (sameIdentity(this.artifact.identity, selected) ||
        this.artifact.manifest.trustTier === "community-static")
    )
      this.restoreDefault();
    try {
      this.options.host.revoke(selected);
    } catch (error) {
      this.recovery =
        "Interface access was disabled for this launch, but revocation could not be saved. Repair storage and use --safe-ui on restart.";
      this.emit();
      throw error;
    }
    this.emit();
    return this.getState();
  }

  workspaceChanged(): void {
    this.restoreDefault(); // Runs, transcripts and drafts remain untouched.
    try {
      this.options.host.revoke();
    } catch {
      this.recovery =
        "Interface access was disabled for this launch, but revocation could not be saved. Repair storage and use --safe-ui on restart.";
      this.emit();
    }
  }

  private showCommunity(): void {
    if (
      this.protectedDepth ||
      !this.community ||
      this.artifact?.manifest.trustTier !== "community-static"
    )
      return;
    const window = this.options.getWindow();
    if (!window || window.isDestroyed()) return;
    const area = window.getContentBounds();
    this.community.setBounds({
      x: 0,
      y: 56,
      width: area.width,
      height: Math.max(0, area.height - 56),
    });
  }

  private persistSelection(): void {
    writeJsonAtomicSync(this.options.statePath, {
      version: 1,
      active: this.artifact?.identity ?? null,
    });
  }
  private emit(): void {
    const window = this.options.getWindow();
    if (window && !window.isDestroyed())
      window.webContents.send(
        uiInterfaceChannels.stateChanged,
        this.getState(),
      );
  }
  private async exclusive<T>(
    operation: () => Promise<T>,
    recover = false,
  ): Promise<T> {
    if (this.disposed) throw new Error("The interface host was closed.");
    if (this.transition)
      throw new Error("Another interface operation is already in progress.");
    this.transition = true;
    try {
      return await operation();
    } catch (error) {
      if (recover && !this.options.safeMode && !this.disposed) {
        this.restoreDefault();
        this.recovery =
          "Interface activation failed safely. Doolittle's default interface is available; running work is unchanged.";
        this.emit();
      }
      throw error;
    } finally {
      this.transition = false;
    }
  }

  private clearSubscriptions(): void {
    for (const unsubscribe of this.subscriptions.values()) unsubscribe();
    this.subscriptions.clear();
  }
  private authorized(event: IpcMainInvokeEvent): boolean {
    const window = this.options.getWindow();
    return Boolean(
      window &&
        !window.isDestroyed() &&
        event.sender === window.webContents &&
        event.senderFrame &&
        event.senderFrame === window.webContents.mainFrame,
    );
  }
  private registerIpc(): void {
    if (this.registered) return;
    this.registered = true;
    const handle = (
      channel: string,
      operation: (...args: unknown[]) => unknown,
    ) =>
      this.options.ipcMain.handle(channel, (event, ...args) => {
        if (!this.authorized(event))
          throw new Error(
            "Only the native main window may use this host surface.",
          );
        return operation(...args);
      });
    handle(uiInterfaceChannels.snapshot, () => this.options.host.getSnapshot());
    handle(uiInterfaceChannels.dispatch, (command) => {
      if (this.options.commandsDisabled)
        throw new Error(
          "Interface commands are disabled until host state is recovered.",
        );
      const epoch = this.activationEpoch;
      return this.options.host.dispatchNative(command as UiHostCommand, () => {
        if (
          this.disposed ||
          this.protectedDepth ||
          epoch !== this.activationEpoch
        )
          throw new Error(
            "The native interface changed or a protected dialog is open.",
          );
      });
    });
    handle(uiInterfaceChannels.state, () => this.getState());
    handle(uiInterfaceChannels.install, () => this.install());
    handle(uiInterfaceChannels.activate, (request) =>
      this.activate(request as UiInterfaceActivation),
    );
    handle(uiInterfaceChannels.restore, () => this.restoreDefault());
    handle(uiInterfaceChannels.revoke, (value) =>
      this.revoke(value as UiPluginArtifactIdentity),
    );
    handle(uiInterfaceChannels.stopAll, () => {
      if (this.protectedDepth) throw new Error("A protected dialog is open.");
      return this.options.stopAll();
    });
    handle(uiInterfaceChannels.subscribe, (unsafeId, after) => {
      if (
        typeof unsafeId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/u.test(unsafeId) ||
        this.subscriptions.size >= 8 ||
        this.subscriptions.has(unsafeId)
      )
        throw new Error("Invalid UI subscription.");
      if (
        after !== undefined &&
        (!Number.isSafeInteger(after) || Number(after) < 0)
      )
        throw new Error("Invalid UI cursor.");
      const unsubscribe = this.options.host.subscribe(
        (value) => {
          const window = this.options.getWindow();
          if (window && !window.isDestroyed())
            window.webContents.send(uiInterfaceChannels.event, {
              subscriptionId: unsafeId,
              value,
            });
        },
        after as number | undefined,
      );
      this.subscriptions.set(unsafeId, unsubscribe);
    });
    handle(uiInterfaceChannels.unsubscribe, (unsafeId) => {
      if (typeof unsafeId !== "string")
        throw new Error("Invalid subscription.");
      this.subscriptions.get(unsafeId)?.();
      this.subscriptions.delete(unsafeId);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.activationEpoch += 1;
    this.community?.dispose();
    this.community = undefined;
    this.clearSubscriptions();
    for (const [key, channel] of Object.entries(uiInterfaceChannels))
      if (!["event", "stateChanged", "surface"].includes(key))
        this.options.ipcMain.removeHandler(channel);
    this.options.protocol.unhandle(UI_SCHEME);
    const window = this.attachedWindow;
    window?.removeListener("resize", this.onResize);
    window?.removeListener("show", this.onResize);
    window?.removeListener("hide", this.onHide);
    window?.webContents.removeListener("destroyed", this.onDestroyed);
  }
}
