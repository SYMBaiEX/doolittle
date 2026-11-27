import { rmSync } from "node:fs";
import { readOptionalJson, writeJsonAtomicSync } from "@doolittle/storage";
import type { AppUpdater } from "electron-updater";
import type { DesktopUpdateState } from "../shared/contracts";

// electron-updater remains CommonJS. Its documented named import does not load
// from Electron's native ESM main process, so unwrap the package default here.

export type UpdateProvider = Pick<
  AppUpdater,
  "checkForUpdates" | "downloadUpdate" | "on" | "quitAndInstall"
>;

export type ConfigurableUpdateProvider = UpdateProvider &
  Pick<AppUpdater, "autoDownload" | "autoInstallOnAppQuit" | "setFeedURL">;

type LoadUpdateProvider = () => Promise<UpdateProvider>;
type UpdateFailureAction = "check" | "download" | "install";

export interface DesktopUpdateControllerOptions {
  downloadedStatePath?: string;
}

const MAX_UPDATE_VERSION_LENGTH = 200;

function readDownloadedVersion(path?: string): string | null {
  if (!path) return null;
  try {
    const record = readOptionalJson<{ version?: unknown }>(path);
    return typeof record?.version === "string" &&
      record.version.length <= MAX_UPDATE_VERSION_LENGTH
      ? record.version
      : null;
  } catch {
    return null;
  }
}

const UPDATE_NETWORK_ERROR =
  /\b(?:net::)?err_(?:internet_disconnected|network_changed|network_io_suspended|connection_(?:closed|failed|refused|reset|timed_out)|timed_out|name_not_resolved|address_unreachable|proxy_connection_failed|tunnel_connection_failed|network_access_denied|empty_response)\b|\b(?:econnreset|econnrefused|etimedout|enotfound|eai_again|socket hang up|network request failed|fetch failed)\b/iu;
const UPDATE_SERVER_ERROR =
  /\b(?:http error|status code|cannot parse|invalid json|unexpected response|update server|update info)\b|\b[45]\d\d\b/iu;
const UPDATE_VERIFICATION_ERROR =
  /\b(?:err_checksum_mismatch|checksum|sha512|signature|verification|code signing)\b/iu;

export function updateErrorMessage(
  error: unknown,
  action: UpdateFailureAction = "check",
): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (UPDATE_NETWORK_ERROR.test(detail)) {
    if (action === "download") {
      return "The connection was interrupted before the update finished downloading. The update will wait; download it again when your connection is back.";
    }
    if (action === "check") {
      return "You appear to be offline or the connection was interrupted. The update will wait; check again when your connection is back.";
    }
  }
  if (UPDATE_VERIFICATION_ERROR.test(detail)) {
    return "The update download failed verification, so Doolittle did not install it. Try downloading it again.";
  }
  if (UPDATE_SERVER_ERROR.test(detail)) {
    return "The update server returned an unexpected response. Try again later.";
  }
  if (action === "download") {
    return "The update could not be downloaded. Try again when you are ready.";
  }
  if (action === "install") {
    return "The update could not be installed. Try installing it again, or download the latest release manually.";
  }
  return "Doolittle could not check for updates. Try again later.";
}

export class DesktopUpdateController {
  private state: DesktopUpdateState;
  private listeners = new Set<(state: DesktopUpdateState) => void>();
  private installRequested = false;
  private provider: UpdateProvider | null = null;
  private providerLoad?: Promise<UpdateProvider>;
  private downloadedVersion: string | null;
  private downloadedNeedsPreparation = false;

  constructor(
    private readonly loadProvider: LoadUpdateProvider | null,
    unavailableDetail: string,
    private readonly options: DesktopUpdateControllerOptions = {},
  ) {
    this.downloadedVersion = readDownloadedVersion(options.downloadedStatePath);
    this.state = loadProvider
      ? { phase: "idle", message: "Check for updates when you are ready." }
      : { phase: "unavailable", message: unavailableDetail };
  }

  private attach(provider: UpdateProvider): UpdateProvider {
    provider.on("checking-for-update", () =>
      this.set({ phase: "checking", message: "Checking for updates…" }),
    );
    provider.on("update-available", (info: { version?: string }) => {
      const savedDownload =
        info.version !== undefined && info.version === this.downloadedVersion;
      if (info.version && info.version !== this.downloadedVersion) {
        this.clearDownloadedVersion();
      }
      if (savedDownload) {
        this.downloadedNeedsPreparation = true;
        this.set({
          phase: "downloaded",
          version: info.version,
          message: "Update downloaded. Install when you are ready.",
        });
        return;
      }
      this.set({
        phase: "available",
        version: info.version,
        message: `Version ${info.version ?? ""} is available. Download it when ready.`,
      });
    });
    provider.on("update-not-available", () => {
      this.clearDownloadedVersion();
      this.set({ phase: "current", message: "Doolittle is up to date." });
    });
    provider.on("download-progress", (progress: { percent?: number }) =>
      this.set({
        phase: "downloading",
        ...(this.state.version ? { version: this.state.version } : {}),
        progress: Math.max(0, Math.min(100, Math.round(progress.percent ?? 0))),
        message: "Downloading update…",
      }),
    );
    provider.on("update-downloaded", (info: { version?: string }) => {
      const version = info.version ?? this.state.version;
      this.downloadedNeedsPreparation = false;
      if (version) this.persistDownloadedVersion(version);
      this.set({
        phase: "downloaded",
        version,
        message: "Update downloaded. Install when you are ready.",
      });
    });
    provider.on("error", (error: Error) => {
      this.installRequested = false;
      const action =
        this.state.phase === "downloading"
          ? "download"
          : this.state.phase === "downloaded"
            ? "install"
            : "check";
      this.set({
        phase: "error",
        message: updateErrorMessage(error, action),
      });
    });
    this.provider = provider;
    return provider;
  }

  getState = (): DesktopUpdateState => this.state;
  private persistDownloadedVersion(version: string) {
    this.downloadedVersion = version;
    if (!this.options.downloadedStatePath) return;
    try {
      writeJsonAtomicSync(
        this.options.downloadedStatePath,
        { version },
        { trailingNewline: true },
      );
    } catch {
      // A lost marker never blocks an update that electron-updater already verified.
    }
  }
  private clearDownloadedVersion() {
    if (!this.downloadedVersion) return;
    this.downloadedVersion = null;
    this.downloadedNeedsPreparation = false;
    if (!this.options.downloadedStatePath) return;
    try {
      rmSync(this.options.downloadedStatePath, { force: true });
    } catch {
      // The marker is advisory; electron-updater validates the real cached artifact.
    }
  }
  subscribe(listener: (state: DesktopUpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private set(state: DesktopUpdateState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
  async check(): Promise<DesktopUpdateState> {
    if (!this.loadProvider) return this.state;
    try {
      if (!this.provider && !this.providerLoad) {
        this.providerLoad = Promise.resolve()
          .then(this.loadProvider)
          .then((provider) => this.attach(provider))
          .finally(() => {
            this.providerLoad = undefined;
          });
      }
      const provider = this.provider ?? (await this.providerLoad);
      await provider?.checkForUpdates();
      return this.state;
    } catch (error) {
      const message = updateErrorMessage(error, "check");
      if (this.state.phase !== "error") {
        this.set({ phase: "error", message });
      }
      throw new Error(message);
    }
  }
  async download(): Promise<DesktopUpdateState> {
    if (!this.loadProvider) return this.state;
    if (!this.provider || this.state.phase !== "available")
      throw new Error("No update is ready to download.");
    this.set({
      phase: "downloading",
      ...(this.state.version ? { version: this.state.version } : {}),
      progress: 0,
      message: "Downloading update…",
    });
    try {
      await this.provider.downloadUpdate();
      return this.state;
    } catch (error) {
      const message = updateErrorMessage(error, "download");
      if (this.getState().phase !== "error") {
        this.set({ phase: "error", message });
      }
      throw new Error(message);
    }
  }
  async install(): Promise<void> {
    if (!this.loadProvider) throw new Error(this.state.message);
    if (!this.provider || this.state.phase !== "downloaded")
      throw new Error("No downloaded update is ready to install.");
    if (this.installRequested) return;
    this.installRequested = true;
    try {
      if (this.downloadedNeedsPreparation) {
        this.set({
          phase: "downloading",
          ...(this.state.version ? { version: this.state.version } : {}),
          progress: 0,
          message: "Preparing downloaded update…",
        });
        await this.provider.downloadUpdate();
      }
      this.provider.quitAndInstall();
    } catch (error) {
      this.installRequested = false;
      const message =
        this.getState().phase === "error"
          ? this.getState().message
          : updateErrorMessage(error, "install");
      throw new Error(message);
    }
  }
}

export function configureUpdateProvider(
  provider: ConfigurableUpdateProvider,
  genericFeedUrl?: string,
): UpdateProvider {
  provider.autoDownload = false;
  // Quitting is not install consent. electron-updater keeps verified downloads
  // in its persistent pending cache and revalidates that artifact on the next
  // explicit downloadUpdate call, so this does not throw the download away.
  provider.autoInstallOnAppQuit = false;
  if (genericFeedUrl) {
    provider.setFeedURL({ provider: "generic", url: genericFeedUrl });
  }
  return provider;
}

// Packaged builds normally read the GitHub provider generated by electron-builder
// from app-update.yml. A generic feed remains available for private distributions.
export function configuredUpdater(
  platform: NodeJS.Platform = process.platform,
): LoadUpdateProvider | null {
  // electron-updater validates Linux artifacts only against hashes delivered
  // by the same unsigned metadata channel. Until the release feed has an
  // independently pinned signature, keep Linux updates explicit/manual.
  if (platform === "linux") return null;
  return async () => {
    const { default: electronUpdater } = await import("electron-updater");
    return configureUpdateProvider(
      electronUpdater.autoUpdater,
      process.env.DOOLITTLE_UPDATE_FEED_URL?.trim() || undefined,
    );
  };
}
