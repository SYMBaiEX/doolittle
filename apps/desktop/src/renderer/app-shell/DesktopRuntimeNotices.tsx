import type { BackendState } from "../../shared/contracts";

export interface DesktopRuntimeNoticesProps {
  backend: BackendState;
  globalError: string;
  onRestart: () => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
}

const NOTICE_ACTION =
  "inline-flex min-h-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-current bg-transparent px-3 text-sm font-medium hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] max-[760px]:min-h-11";

function runtimeRecoveryMessage(diagnostic: string): string {
  if (
    /acquireDataDirLockIfNeeded|data.directory.*(?:lock|in use)|already.*(?:running|locked)/iu.test(
      diagnostic,
    )
  ) {
    return "Another Doolittle runtime may be using the local data. Close the other instance, then restart.";
  }
  if (/timed out|timeout/iu.test(diagnostic)) {
    return "The runtime did not become ready in time. Try restarting it.";
  }
  return "Your conversations are retained. Restart the runtime to reconnect.";
}

function TechnicalDetails({ diagnostic }: { diagnostic: string }) {
  return diagnostic ? (
    <details className="w-full min-w-0 text-sm text-[var(--muted)]">
      <summary className="min-h-10 cursor-pointer py-2 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
        Technical details
      </summary>
      <pre
        className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--bg)] p-3 font-[var(--font-mono)] text-xs leading-5"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: A bounded diagnostic scrollport must be keyboard-scrollable.
        tabIndex={0}
      >
        {diagnostic}
      </pre>
    </details>
  ) : null;
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
        <section className="shrink-0 border-b border-[var(--border)] bg-[var(--warn-soft)] px-4 py-2 text-[var(--warn)]">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div
              aria-atomic="true"
              aria-label="Local runtime unavailable"
              aria-live="polite"
              className="min-w-0 flex-1 basis-60 text-sm leading-5"
              role="status"
            >
              <strong className="font-semibold">
                The local runtime is unavailable.
              </strong>
              <p className="m-0 mt-1 text-[var(--text-soft)]">
                {runtimeRecoveryMessage(
                  `${backend.message}\n${backend.detail ?? ""}`,
                )}
              </p>
            </div>
            <button className={NOTICE_ACTION} onClick={onRestart} type="button">
              Restart runtime
            </button>
          </div>
          <TechnicalDetails diagnostic={backend.detail || backend.message} />
        </section>
      ) : null}
      {globalError ? (
        <div
          aria-atomic="true"
          aria-label="Application error"
          className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bad-soft)] px-4 py-2 text-sm leading-5 text-[var(--bad)]"
          role="alert"
        >
          <span className="min-w-0 flex-1 basis-60 break-words">
            {globalError}
          </span>
          <button className={NOTICE_ACTION} onClick={onRefresh} type="button">
            Retry
          </button>
        </div>
      ) : null}
    </>
  );
}
