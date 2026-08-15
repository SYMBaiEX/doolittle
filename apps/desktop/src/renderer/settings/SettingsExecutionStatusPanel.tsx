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
  const readyCount = backends.filter((backend) => backend.ready).length;
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
        <div className="flex items-center gap-2">
          <Badge
            tone={
              error || (backends.length > 0 && readyCount < backends.length)
                ? "warn"
                : readyCount > 0
                  ? "good"
                  : "neutral"
            }
          >
            {status}
          </Badge>
          <button className="text-button" onClick={onReload} type="button">
            Recheck
          </button>
        </div>
      </div>
      {loading ? (
        <LoadingBlock label="Checking execution backends…" />
      ) : error ? (
        <ErrorBlock error={error} retry={onReload} />
      ) : backends.length > 0 ? (
        <div
          className={SETTINGS_EXECUTION_GRID_CLASS}
          data-settings-execution-backends="true"
        >
          {backends.map((backend, index) => (
            <div
              className="grid min-h-11 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-1.5"
              key={asString(backend.backend, String(index))}
            >
              <div className="grid min-w-0 gap-0.5">
                <strong className="truncate text-[10px]">
                  {titleCase(asString(backend.backend, "Backend"))}
                </strong>
                <small className="truncate text-[var(--text-meta)] text-[var(--muted)]">
                  {asString(backend.detail, "No health detail")}
                </small>
              </div>
              <Badge tone={backend.ready ? "good" : "warn"}>
                {backend.ready ? "Ready" : "Unavailable"}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 px-0.5 pt-1.75 pb-0.5 text-[var(--text-meta)] text-[var(--muted)]">
          No execution backends were reported by the runtime.
        </p>
      )}
    </section>
  );
}
