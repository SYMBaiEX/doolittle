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
        <div>
          <span className="eyebrow">Desktop</span>
          <h2>Background & updates</h2>
        </div>
      </div>
      <div className="settings-rows">
        <div className={SETTINGS_ROW_LAYOUT_CLASS}>
          <div className="setting-copy">
            <strong>Keep running in the background</strong>
            <small>
              When enabled, closing the window hides Doolittle so active local
              work can continue. Quit always stops it.
            </small>
          </div>
          <div className="setting-control">
            <label className={SETTINGS_SWITCH_CLASS}>
              <input
                checked={lifecycle?.keepRunningInBackground ?? false}
                className={SETTINGS_SWITCH_INPUT_CLASS}
                disabled={!lifecycle}
                type="checkbox"
                onChange={(event) => onBackgroundChange(event.target.checked)}
              />
              <i className={SETTINGS_SWITCH_TRACK_CLASS} />
              <span className={SETTINGS_SWITCH_LABEL_CLASS}>
                {lifecycle?.keepRunningInBackground ? "On" : "Off"}
              </span>
            </label>
          </div>
        </div>
        <div className={SETTINGS_ROW_LAYOUT_CLASS}>
          <div className="setting-copy">
            <strong>Application updates</strong>
            <small>{update?.message ?? "Loading update status…"}</small>
            {update?.progress !== undefined ? (
              <small>{update.progress}% downloaded</small>
            ) : null}
          </div>
          <div className="setting-control">
            <div className="button-row">
              <button
                className="secondary-button"
                disabled={
                  updateBusy ||
                  update?.phase === "unavailable" ||
                  update?.phase === "checking" ||
                  update?.phase === "downloading"
                }
                onClick={onCheckUpdates}
                type="button"
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
