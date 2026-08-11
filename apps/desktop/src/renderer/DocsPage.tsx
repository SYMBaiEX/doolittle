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
import "./diagnostics-pages.css";

interface DoctorResponse {
  checks?: unknown[];
}

export interface DoctorCheckView {
  id: string;
  label: string;
  detail: string;
  status: string;
}

export function normalizeDoctorChecks(value: unknown): DoctorCheckView[] {
  return asArray(asRecord(value).checks).map(
    (value, index): DoctorCheckView => {
      const check = asRecord(value);
      const label = asString(
        check.summary,
        asString(check.name, asString(check.label, "Unnamed check")),
      ).trim();
      const detail = asString(
        check.detail,
        asString(check.message, "No details"),
      ).trim();
      return {
        id: asString(check.id, `${label}:${detail}:${index}`),
        label,
        detail,
        status: asString(check.status, "unknown").trim().toLowerCase(),
      };
    },
  );
}

export function prioritizeDoctorChecks(
  checks: DoctorCheckView[],
  limit = 8,
): { visible: DoctorCheckView[]; remaining: DoctorCheckView[] } {
  const prioritized = [
    ...checks.filter((check) => check.status !== "pass"),
    ...checks.filter((check) => check.status === "pass"),
  ];
  return {
    visible: prioritized.slice(0, limit),
    remaining: prioritized.slice(limit),
  };
}

function DoctorCheckRow({ check }: { check: DoctorCheckView }) {
  return (
    <div className="status-row">
      <div>
        <strong>{check.label}</strong>
        <small>{check.detail}</small>
      </div>
      <Badge
        tone={
          ["pass", "ready", "ok"].includes(check.status)
            ? "good"
            : check.status === "warn"
              ? "warn"
              : "bad"
        }
      >
        {titleCase(check.status)}
      </Badge>
    </div>
  );
}

export function DocsPage({ active }: { active: boolean }) {
  const doctor = useApiResource<DoctorResponse>(active ? "/doctor" : null, [
    active,
  ]);
  const setup = useApiResource<Record<string, unknown>>(
    active ? "/setup/summary" : null,
    [active],
  );
  const checks = normalizeDoctorChecks(doctor.data);
  const prioritizedChecks = prioritizeDoctorChecks(checks);
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
              {prioritizedChecks.visible.map((check) => (
                <DoctorCheckRow check={check} key={check.id} />
              ))}
            </div>
          )}
          {prioritizedChecks.remaining.length ? (
            <details className="compact-disclosure">
              <summary>
                {prioritizedChecks.remaining.length} more checks
              </summary>
              <div className="stack-list">
                {prioritizedChecks.remaining.map((check) => (
                  <DoctorCheckRow check={check} key={check.id} />
                ))}
              </div>
            </details>
          ) : null}
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
