import { autoUpdater } from "electron-updater";
import type { DesktopUpdateState } from "../shared/contracts";

export interface UpdateProvider {
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export class DesktopUpdateController {
  private state: DesktopUpdateState;
  private listeners = new Set<(state: DesktopUpdateState) => void>();

  constructor(provider: UpdateProvider | null, unavailableDetail: string) {
    this.state = provider
      ? { phase: "idle", message: "Check for updates when you are ready." }
      : { phase: "unavailable", message: unavailableDetail };
    if (!provider) return;
    provider.on("checking-for-update", () =>
      this.set({ phase: "checking", message: "Checking for updates…" }),
    );
    provider.on("update-available", (info: { version?: string }) =>
      this.set({
        phase: "available",
        version: info.version,
        message: `Version ${info.version ?? ""} is available. Download it when ready.`,
      }),
    );
    provider.on("update-not-available", () =>
      this.set({ phase: "current", message: "Doolittle is up to date." }),
    );
    provider.on("download-progress", (progress: { percent?: number }) =>
      this.set({
        phase: "downloading",
        progress: Math.max(0, Math.min(100, Math.round(progress.percent ?? 0))),
        message: "Downloading update…",
      }),
    );
    provider.on("update-downloaded", (info: { version?: string }) =>
      this.set({
        phase: "downloaded",
        version: info.version,
        message: "Update downloaded. Install when you are ready.",
      }),
    );
    provider.on("error", (error: Error) =>
      this.set({
        phase: "error",
        message: error.message || "Update check failed.",
      }),
    );
    this.provider = provider;
  }

  private provider: UpdateProvider | null = null;
  getState = (): DesktopUpdateState => this.state;
  subscribe(listener: (state: DesktopUpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private set(state: DesktopUpdateState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
  async check(): Promise<DesktopUpdateState> {
    if (!this.provider) return this.state;
    await this.provider.checkForUpdates();
    return this.state;
  }
  async download(): Promise<DesktopUpdateState> {
    if (!this.provider) return this.state;
    if (this.state.phase !== "available")
      throw new Error("No update is ready to download.");
    await this.provider.downloadUpdate();
    return this.state;
  }
  install(): void {
    if (!this.provider) throw new Error(this.state.message);
    if (this.state.phase !== "downloaded")
      throw new Error("No downloaded update is ready to install.");
    this.provider.quitAndInstall();
  }
}

// electron-updater is intentionally optional until a signed publisher/feed is configured.
export function configuredUpdater(): UpdateProvider | null {
  const feedUrl = process.env.DOOLITTLE_UPDATE_FEED_URL?.trim();
  if (!feedUrl) return null;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.setFeedURL({ provider: "generic", url: feedUrl });
  return autoUpdater as unknown as UpdateProvider;
}
