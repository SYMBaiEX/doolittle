import { Download, MonitorCog, RefreshCw } from "lucide-react";
import type {
  DesktopLifecycleState,
  DesktopUpdateState,
} from "../../shared/contracts";
import {
  WorkbenchAction,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import {
  SETTINGS_ROW_LAYOUT_CLASS,
  SETTINGS_SWITCH_CLASS,
  SETTINGS_SWITCH_INPUT_CLASS,
  SETTINGS_SWITCH_LABEL_CLASS,
  SETTINGS_SWITCH_TRACK_CLASS,
} from "./settings-layout";

export interface DesktopSettingsPanelProps {
  lifecycle: DesktopLifecycleState | null;
  lifecycleBusy?: boolean;
  lifecycleError?: string;
  onLifecycleRetry?: () => void;
  update: DesktopUpdateState | null;
  updateBusy: boolean;
  onBackgroundChange: (enabled: boolean) => void;
  onCheckUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
}

export function DesktopSettingsPanel({
  lifecycle,
  lifecycleBusy = false,
  lifecycleError = "",
  onLifecycleRetry,
  update,
  updateBusy,
  onBackgroundChange,
  onCheckUpdates,
  onDownloadUpdate,
  onInstallUpdate,
}: DesktopSettingsPanelProps) {
  return (
    <WorkbenchSection
      className="settings-workbench-section"
      icon={MonitorCog}
      title="Desktop"
    >
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
            {lifecycleError ? (
              <small className="field-error" role="alert">
                {lifecycleError}
              </small>
            ) : !lifecycle ? (
              <small role="status">Loading desktop state…</small>
            ) : null}
            {lifecycleBusy ? (
              <small role="status">Saving background behavior…</small>
            ) : null}
          </div>
          <div className="setting-control">
            <label className={SETTINGS_SWITCH_CLASS}>
              <input
                checked={lifecycle?.keepRunningInBackground ?? false}
                className={SETTINGS_SWITCH_INPUT_CLASS}
                disabled={!lifecycle || lifecycleBusy}
                aria-describedby="desktop-background-description"
                aria-label="Keep running in the background"
                type="checkbox"
                onChange={(event) => onBackgroundChange(event.target.checked)}
              />
              <i className={SETTINGS_SWITCH_TRACK_CLASS} aria-hidden="true" />
              <span className={SETTINGS_SWITCH_LABEL_CLASS}>
                {!lifecycle
                  ? lifecycleError
                    ? "Unavailable"
                    : "Loading…"
                  : lifecycle.keepRunningInBackground
                    ? "On"
                    : "Off"}
              </span>
            </label>
            {lifecycleError && onLifecycleRetry ? (
              <WorkbenchAction
                disabled={lifecycleBusy}
                emphasis="quiet"
                icon={RefreshCw}
                onClick={onLifecycleRetry}
              >
                Retry desktop state
              </WorkbenchAction>
            ) : null}
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
            {update?.phase === "downloaded" ? (
              <small id="desktop-install-description">
                Save your work before opening the native installer. Doolittle
                will close and reopen when installation finishes.
              </small>
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
              <WorkbenchAction
                disabled={
                  !update ||
                  updateBusy ||
                  update?.phase === "unavailable" ||
                  update?.phase === "checking" ||
                  update?.phase === "downloading"
                }
                icon={RefreshCw}
                onClick={onCheckUpdates}
                aria-label={
                  update?.phase === "checking"
                    ? "Checking for updates"
                    : undefined
                }
              >
                Check for updates
              </WorkbenchAction>
              {update?.phase === "available" ||
              (update?.phase === "error" && update.version) ? (
                <WorkbenchAction
                  disabled={updateBusy}
                  icon={Download}
                  onClick={onDownloadUpdate}
                >
                  {update?.phase === "error" ? "Retry download" : "Download"}
                </WorkbenchAction>
              ) : null}
              {update?.phase === "downloaded" ? (
                <WorkbenchAction
                  aria-describedby="desktop-install-description"
                  disabled={updateBusy}
                  emphasis="primary"
                  onClick={onInstallUpdate}
                >
                  Install and restart
                </WorkbenchAction>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </WorkbenchSection>
  );
}
