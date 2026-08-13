import type { BackendState } from "../../shared/contracts";

export interface DesktopRuntimeNoticesProps {
  backend: BackendState;
  globalError: string;
  onRestart: () => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
}

export function DesktopRuntimeNotices({
  backend,
  globalError,
  onRestart,
  onRefresh,
}: DesktopRuntimeNoticesProps) {
  return (
    <>
      {backend.phase === "degraded" ? (
        <div
          aria-atomic="true"
          aria-label="Local runtime unavailable"
          aria-live="polite"
          className="runtime-banner"
          role="status"
        >
          <div>
            <strong>The local runtime is unavailable.</strong>
            <span>{backend.detail || backend.message}</span>
          </div>
          <button className="primary-button" onClick={onRestart} type="button">
            Restart runtime
          </button>
        </div>
      ) : null}
      {globalError ? (
        <div
          aria-atomic="true"
          aria-label="Application error"
          className="global-error"
          role="alert"
        >
          <span>{globalError}</span>
          <button onClick={onRefresh} type="button">
            Retry
          </button>
        </div>
      ) : null}
    </>
  );
}
