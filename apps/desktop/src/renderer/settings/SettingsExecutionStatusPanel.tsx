import {
  asArray,
  asRecord,
  asString,
  Badge,
  ErrorBlock,
  LoadingBlock,
  titleCase,
} from "../lib";

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
    <section className="settings-group settings-execution-status">
      <div className="settings-group-heading">
        <div>
          <span className="eyebrow">Readiness</span>
          <h2>Execution backends</h2>
        </div>
        <div className="settings-execution-status-actions">
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
        <div className="settings-execution-backends">
          {backends.map((backend, index) => (
            <div
              className="settings-execution-backend"
              key={asString(backend.backend, String(index))}
            >
              <div>
                <strong className="settings-execution-backend-name">
                  {titleCase(asString(backend.backend, "Backend"))}
                </strong>
                <small className="settings-execution-backend-detail">
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
        <p className="settings-execution-empty">
          No execution backends were reported by the runtime.
        </p>
      )}
    </section>
  );
}
