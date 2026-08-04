import {
  asArray,
  asRecord,
  asString,
  Badge,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  titleCase,
  useApiResource,
} from "./lib";

interface DoctorResponse {
  checks?: unknown[];
}

export function DocsPage({ active }: { active: boolean }) {
  const doctor = useApiResource<DoctorResponse>(active ? "/doctor" : null, [
    active,
  ]);
  const setup = useApiResource<Record<string, unknown>>(
    active ? "/setup/summary" : null,
    [active],
  );
  const checks = asArray(doctor.data?.checks).map(asRecord);
  const passing = checks.filter((check) =>
    ["pass", "ready", "ok"].includes(asString(check.status).toLowerCase()),
  ).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Help"
        title="About Doolittle"
        description="A private desktop workspace for the Doolittle ElizaOS agent runtime."
      />
      <div className="about-hero">
        <div className="about-mark" aria-hidden="true">
          D
        </div>
        <div>
          <span className="eyebrow">Doolittle Desktop</span>
          <h2>Local agent. Native workspace.</h2>
          <p>
            The Electron shell communicates with a private loopback runtime.
            Conversations, settings, automations, logs, and profiles remain in
            the application data directory on this computer.
          </p>
        </div>
      </div>
      <div className="metric-grid compact">
        <MetricCard label="Health checks" value={checks.length} />
        <MetricCard label="Passing" value={passing} />
        <MetricCard label="Runtime transport" value="Loopback" />
        <MetricCard label="Desktop bridge" value="Sandboxed" />
      </div>
      <div className="two-column-grid">
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Runtime doctor</span>
              <h2>System checks</h2>
            </div>
            <button
              className="text-button"
              onClick={doctor.reload}
              type="button"
            >
              Run again
            </button>
          </div>
          {doctor.loading ? (
            <LoadingBlock />
          ) : doctor.error ? (
            <ErrorBlock error={doctor.error} retry={doctor.reload} />
          ) : (
            <div className="stack-list">
              {checks.map((check) => {
                const status = asString(check.status, "unknown");
                return (
                  <div
                    className="status-row"
                    key={`${asString(
                      check.name,
                      asString(check.label, "Unnamed check"),
                    )}:${asString(
                      check.detail,
                      asString(check.message),
                    )}:${JSON.stringify(check)}`}
                  >
                    <div>
                      <strong>
                        {asString(
                          check.name,
                          asString(check.label, "Unnamed check"),
                        )}
                      </strong>
                      <small>
                        {asString(
                          check.detail,
                          asString(check.message, "No details"),
                        )}
                      </small>
                    </div>
                    <Badge
                      tone={
                        ["pass", "ready", "ok"].includes(status.toLowerCase())
                          ? "good"
                          : status === "warn"
                            ? "warn"
                            : "bad"
                      }
                    >
                      {titleCase(status)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Quick reference</span>
              <h2>Run Doolittle</h2>
            </div>
          </div>
          <div className="command-list">
            <div>
              <code>./scripts/install.sh</code>
              <span>Install or update the local command.</span>
            </div>
            <div>
              <code>doolittle desktop</code>
              <span>Open this desktop application.</span>
            </div>
            <div>
              <code>doolittle doctor</code>
              <span>Check runtime and provider readiness.</span>
            </div>
            <div>
              <code>doolittle</code>
              <span>Open the terminal interface.</span>
            </div>
          </div>
          {setup.error ? (
            <Notice tone="warn">{setup.error}</Notice>
          ) : setup.data ? (
            <Notice tone="good">
              The local operator setup summary is available and the runtime
              answered successfully.
            </Notice>
          ) : null}
        </section>
      </div>
      <section className="content-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Architecture</span>
            <h2>Desktop security boundary</h2>
          </div>
        </div>
        <div className="architecture-flow">
          <div>
            <strong>React renderer</strong>
            <span>Sandboxed UI</span>
          </div>
          <i>→</i>
          <div>
            <strong>Typed preload</strong>
            <span>Exact endpoint allowlist</span>
          </div>
          <i>→</i>
          <div>
            <strong>Electron main</strong>
            <span>Private IPC</span>
          </div>
          <i>→</i>
          <div>
            <strong>Doolittle runtime</strong>
            <span>127.0.0.1 ephemeral port</span>
          </div>
        </div>
      </section>
    </div>
  );
}
