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

export interface UpdateCheckOptions {
  automatic?: boolean;
}

export const AUTOMATIC_UPDATE_CHECK_START_DELAY_MS = 10_000;
export const AUTOMATIC_UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function canAutomaticallyCheck(state: DesktopUpdateState): boolean {
  return !["unavailable", "checking", "downloading", "downloaded"].includes(
    state.phase,
  );
}

export class DesktopUpdateController {
  private state: DesktopUpdateState;
  private listeners = new Set<(state: DesktopUpdateState) => void>();
  private installRequested = false;
  private automaticChecks = 0;
  private provider: UpdateProvider | null = null;
  private providerLoad?: Promise<UpdateProvider>;

  constructor(
    private readonly loadProvider: LoadUpdateProvider | null,
    unavailableDetail: string,
  ) {
    this.state = loadProvider
      ? { phase: "idle", message: "Check for updates when you are ready." }
      : { phase: "unavailable", message: unavailableDetail };
  }

  private attach(provider: UpdateProvider): UpdateProvider {
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
        ...(this.state.version ? { version: this.state.version } : {}),
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
    provider.on("error", (error: Error) => {
      this.installRequested = false;
      if (this.automaticChecks > 0) return;
      const retriableVersion =
        this.state.phase === "downloading" ? this.state.version : undefined;
      this.set({
        phase: "error",
        ...(retriableVersion ? { version: retriableVersion } : {}),
        message: error.message || "Update check failed.",
      });
    });
    this.provider = provider;
    return provider;
  }

  getState = (): DesktopUpdateState => this.state;
  subscribe(listener: (state: DesktopUpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private set(state: DesktopUpdateState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
  async check(options: UpdateCheckOptions = {}): Promise<DesktopUpdateState> {
    if (!this.loadProvider) return this.state;
    const automatic = options.automatic === true;
    if (automatic && !canAutomaticallyCheck(this.state)) return this.state;
    const previousState = this.state;
    if (automatic) this.automaticChecks += 1;
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
      if (automatic) {
        if (this.state.phase === "checking" || this.state.phase === "error") {
          this.set(previousState);
        }
      } else if (this.state.phase !== "error") {
        this.set({
          phase: "error",
          message:
            error instanceof Error ? error.message : "Update check failed.",
        });
      }
      throw error;
    } finally {
      if (automatic) this.automaticChecks -= 1;
    }
  }
  async download(): Promise<DesktopUpdateState> {
    if (!this.loadProvider) return this.state;
    const retriable =
      this.state.phase === "error" && typeof this.state.version === "string";
    if (!this.provider || (this.state.phase !== "available" && !retriable)) {
      throw new Error("No update is ready to download.");
    }
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
      if (this.state.phase === "downloading") {
        this.set({
          phase: "error",
          ...(this.state.version ? { version: this.state.version } : {}),
          message:
            error instanceof Error ? error.message : "Update download failed.",
        });
      }
      throw error;
    }
  }
  install(): void {
    if (!this.loadProvider) throw new Error(this.state.message);
    if (!this.provider || this.state.phase !== "downloaded")
      throw new Error("No downloaded update is ready to install.");
    if (this.installRequested) return;
    this.installRequested = true;
    try {
      this.provider.quitAndInstall();
    } catch (error) {
      this.installRequested = false;
      throw error;
    }
  }
}

export function startAutomaticUpdateChecks(
  updates: DesktopUpdateController,
): () => void {
  let disposed = false;
  let checkInFlight = false;
  const runCheck = () => {
    if (disposed || checkInFlight) return;
    checkInFlight = true;
    void updates
      .check({ automatic: true })
      .catch(() => undefined)
      .finally(() => {
        checkInFlight = false;
      });
  };
  const startupTimer = setTimeout(
    runCheck,
    AUTOMATIC_UPDATE_CHECK_START_DELAY_MS,
  );
  const intervalTimer = setInterval(
    runCheck,
    AUTOMATIC_UPDATE_CHECK_INTERVAL_MS,
  );
  startupTimer.unref();
  intervalTimer.unref();
  return () => {
    disposed = true;
    clearTimeout(startupTimer);
    clearInterval(intervalTimer);
  };
}

export function configureUpdateProvider(
  provider: ConfigurableUpdateProvider,
  genericFeedUrl?: string,
): UpdateProvider {
  provider.autoDownload = false;
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
