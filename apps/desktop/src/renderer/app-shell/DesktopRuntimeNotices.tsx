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
          className="flex min-h-9 shrink-0 items-center justify-between gap-2.5 border-b border-[color-mix(in_srgb,var(--warn)_22%,var(--border))] bg-[color-mix(in_srgb,var(--warn-soft)_72%,var(--surface))] px-2.5 py-1.5 text-[length:var(--text-meta)] text-[var(--warn)]"
          role="status"
        >
          <div className="flex min-w-0 items-baseline gap-1.75">
            <strong>The local runtime is unavailable.</strong>
            <span className="truncate text-[var(--muted)]">
              {backend.detail || backend.message}
            </span>
          </div>
          <button
            className="min-h-6.25 shrink-0 rounded-[var(--radius-xs)] border border-[color-mix(in_srgb,var(--warn)_35%,var(--border))] bg-transparent px-1.75 py-1 font-bold text-[var(--warn)]"
            onClick={onRestart}
            type="button"
          >
            Restart runtime
          </button>
        </div>
      ) : null}
      {globalError ? (
        <div
          aria-atomic="true"
          aria-label="Application error"
          className="flex min-h-9 shrink-0 items-center justify-between gap-2.5 border-b border-[color-mix(in_srgb,var(--bad)_30%,var(--border))] bg-[color-mix(in_srgb,var(--bad-soft)_72%,var(--surface))] px-2.5 py-1.5 text-[length:var(--text-meta)] text-[var(--bad)]"
          role="alert"
        >
          <span>{globalError}</span>
          <button
            className="shrink-0 border-0 bg-transparent font-bold text-[var(--bad)]"
            onClick={onRefresh}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}
    </>
  );
}
