import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";
import type { BackendState } from "../../shared/contracts";

export interface DesktopRuntimeNoticesProps {
  backend: BackendState;
  globalError: string;
  onRestart: () => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
}

const NOTICE_ACTION =
  "secondary-button inline-flex min-h-8 shrink-0 items-center gap-1.5 text-xs";

function runtimeRecoveryMessage(diagnostic: string): string {
  if (/OS Keychain|master key unavailable/iu.test(diagnostic)) {
    return "Your saved accounts are locked. If macOS asks to unlock the login keychain, enter your Mac login password, then restart the runtime.";
  }
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
  if (backend.phase === "booting")
    return (
      <div
        className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)]"
        role="status"
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-3.5 shrink-0 motion-safe:animate-spin"
        />
        {backend.message}
      </div>
    );
  if (backend.phase !== "ready") {
    const stopped = backend.phase === "stopped";
    return (
      <section className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <AlertCircle
            aria-hidden="true"
            className="mt-1 size-4 shrink-0 text-[var(--warn)]"
          />
          <div
            aria-atomic="true"
            className="min-w-0 flex-1 text-sm leading-5"
            role="status"
          >
            <strong className="font-semibold">
              {stopped ? "Local runtime stopped" : "Local runtime unavailable"}
            </strong>
            <p className="m-0 mt-1 text-[var(--text-soft)]">
              {runtimeRecoveryMessage(
                `${backend.message}\n${backend.detail ?? ""}`,
              )}
            </p>
          </div>
          <button className={NOTICE_ACTION} onClick={onRestart} type="button">
            <RotateCcw aria-hidden="true" className="size-3.5" />
            {stopped ? "Start runtime" : "Restart runtime"}
          </button>
        </div>
        {backend.detail ? (
          <TechnicalDetails diagnostic={backend.detail} />
        ) : null}
      </section>
    );
  }
  return globalError ? (
    <div
      aria-atomic="true"
      aria-label="Application error"
      className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bad-soft)] px-4 py-2 text-sm leading-5 text-[var(--bad)]"
      role="alert"
    >
      <span className="min-w-0 flex-1 basis-60 break-words">{globalError}</span>
      <button className={NOTICE_ACTION} onClick={onRefresh} type="button">
        Retry
      </button>
    </div>
  ) : null;
}
