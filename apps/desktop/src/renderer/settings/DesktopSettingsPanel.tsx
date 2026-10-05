import type {
  DesktopLifecycleState,
  DesktopUpdateState,
} from "../../shared/contracts";
import {
  SETTINGS_GROUP_CLASS,
  SETTINGS_ROW_LAYOUT_CLASS,
  SETTINGS_SWITCH_CLASS,
  SETTINGS_SWITCH_INPUT_CLASS,
  SETTINGS_SWITCH_LABEL_CLASS,
  SETTINGS_SWITCH_TRACK_CLASS,
} from "./settings-layout";

export interface DesktopSettingsPanelProps {
  lifecycle: DesktopLifecycleState | null;
  update: DesktopUpdateState | null;
  updateBusy: boolean;
  onBackgroundChange: (enabled: boolean) => void;
  onCheckUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
}

export function DesktopSettingsPanel({
  lifecycle,
  update,
  updateBusy,
  onBackgroundChange,
  onCheckUpdates,
  onDownloadUpdate,
  onInstallUpdate,
}: DesktopSettingsPanelProps) {
  return (
    <section className={SETTINGS_GROUP_CLASS}>
      <div className="settings-group-heading">
        <h2>Desktop</h2>
      </div>
      <div className="settings-rows">
        <div
          className={`${SETTINGS_ROW_LAYOUT_CLASS} dl-settings-preference-row`}
        >
          <div className="setting-copy">
            <strong>Keep running in the background</strong>
            <small id="desktop-background-description">
              When enabled, closing the window hides Doolittle so active local
              work can continue. Quit always stops it.
            </small>
            {!lifecycle ? (
              <small role="status">Loading desktop state…</small>
            ) : null}
          </div>
          <div className="setting-control">
            <label className={SETTINGS_SWITCH_CLASS}>
              <input
                checked={lifecycle?.keepRunningInBackground ?? false}
                className={SETTINGS_SWITCH_INPUT_CLASS}
                disabled={!lifecycle}
                aria-describedby="desktop-background-description"
                aria-label="Keep running in the background"
                type="checkbox"
                onChange={(event) => onBackgroundChange(event.target.checked)}
              />
              <i className={SETTINGS_SWITCH_TRACK_CLASS} aria-hidden="true" />
              <span className={SETTINGS_SWITCH_LABEL_CLASS}>
                {lifecycle?.keepRunningInBackground ? "On" : "Off"}
              </span>
            </label>
          </div>
        </div>
        <div
          className={`${SETTINGS_ROW_LAYOUT_CLASS} dl-settings-preference-row`}
        >
          <div className="setting-copy">
            <strong>Application updates</strong>
            <small
              aria-live={update?.phase === "error" ? "assertive" : "polite"}
              role="status"
            >
              {update?.message ?? "Loading update status…"}
            </small>
            {update?.phase === "downloading" &&
            update.progress !== undefined ? (
              <progress
                aria-label="Update download progress"
                className="h-2 w-full max-w-64 accent-[var(--accent)]"
                max={100}
                value={Math.min(100, Math.max(0, update.progress))}
              />
            ) : null}
            {update?.phase === "downloading" &&
            update.progress !== undefined ? (
              <small>
                {Math.round(Math.min(100, Math.max(0, update.progress)))}%
                downloaded
              </small>
            ) : null}
          </div>
          <div className="setting-control">
            <div className="button-row dl-settings-desktop-actions">
              <button
                className="secondary-button"
                disabled={
                  !update ||
                  updateBusy ||
                  update?.phase === "unavailable" ||
                  update?.phase === "checking" ||
                  update?.phase === "downloading"
                }
                onClick={onCheckUpdates}
                type="button"
                aria-label={
                  update?.phase === "checking"
                    ? "Checking for updates"
                    : undefined
                }
              >
                Check for updates
              </button>
              {update?.phase === "available" ? (
                <button
                  className="secondary-button"
                  disabled={updateBusy}
                  onClick={onDownloadUpdate}
                  type="button"
                >
                  Download
                </button>
              ) : null}
              {update?.phase === "downloaded" ? (
                <button
                  className="primary-button"
                  disabled={updateBusy}
                  onClick={onInstallUpdate}
                  type="button"
                >
                  Install and restart
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
