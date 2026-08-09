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
        <div className="runtime-banner">
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
        <div className="global-error">
          <span>{globalError}</span>
          <button onClick={onRefresh} type="button">
            Retry
          </button>
        </div>
      ) : null}
    </>
  );
}
