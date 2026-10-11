import {
  asArray,
  asRecord,
  asString,
  Badge,
  ErrorBlock,
  LoadingBlock,
  titleCase,
} from "../lib";
import {
  SETTINGS_EXECUTION_GRID_CLASS,
  SETTINGS_GROUP_CLASS,
} from "./settings-layout";

export function SettingsExecutionStatusPanel({
  data,
  error,
  loading,
  onReload,
}: {
  data: Record<string, unknown> | null;
  error: string;
  loading: boolean;
  onReload: () => void;
}) {
  const backends = asArray(data?.backends).map(asRecord);
  const readyCount = backends.filter(
    (backend) => backend.ready === true,
  ).length;
  const status = loading
    ? "Checking"
    : error
      ? "Unavailable"
      : `${readyCount}/${backends.length} ready`;

  return (
    <section className={SETTINGS_GROUP_CLASS}>
      <div className="settings-group-heading">
        <div>
          <span className="eyebrow">Readiness</span>
          <h2>Execution backends</h2>
        </div>
        <div className="flex items-center gap-2 [&_.badge]:!text-sm">
          <Badge
            tone={
              loading
                ? "neutral"
                : error || (backends.length > 0 && readyCount < backends.length)
                  ? "warn"
                  : readyCount > 0
                    ? "good"
                    : "neutral"
            }
          >
            {status}
          </Badge>
          {!error ? (
            <button
              className="text-button min-h-10 px-2 text-sm max-[760px]:min-h-11"
              disabled={loading}
              onClick={onReload}
              type="button"
            >
              Recheck
            </button>
          ) : null}
        </div>
      </div>
      <p className="settings-status-note">
        Readiness does not grant execution access. Workspace permissions and
        native approvals still apply.
      </p>
      {loading ? (
        <LoadingBlock label="Checking execution backends…" />
      ) : error ? (
        <ErrorBlock error={error} retry={onReload} />
      ) : backends.length > 0 ? (
        <div
          className={`${SETTINGS_EXECUTION_GRID_CLASS} border-t border-[var(--line-subtle)]`}
          data-settings-execution-backends="true"
        >
          {backends.map((backend, index) => (
            <div
              className="grid min-h-12 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--line-subtle)] px-0.5 py-2"
              key={asString(backend.backend, String(index))}
            >
              <div className="grid min-w-0 gap-1">
                <strong className="text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
                  {titleCase(asString(backend.backend, "Backend"))}
                </strong>
                <small className="min-w-0 text-sm leading-snug text-[var(--text-soft)] [overflow-wrap:anywhere]">
                  {asString(backend.detail, "No health detail")}
                </small>
              </div>
              <span className="[&_.badge]:!text-sm">
                <Badge tone={backend.ready === true ? "good" : "warn"}>
                  {backend.ready === true
                    ? "Ready"
                    : backend.ready === false
                      ? "Unavailable"
                      : "Not reported"}
                </Badge>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 px-0.5 pt-1 pb-0.25 text-[length:var(--text-meta)] text-[var(--muted)]">
          No execution backends were reported by the runtime.
        </p>
      )}
    </section>
  );
}
