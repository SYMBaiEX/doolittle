import { Button } from "@doolittle/ui";
import { ArrowRight, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { UiIcon } from "./components/UiIcon";
import {
  DIAGNOSTICS_CARD_CLASS,
  DIAGNOSTICS_CARD_HEADING_CLASS,
  DIAGNOSTICS_CHEVRON_CLASS,
  DIAGNOSTICS_DETAILS_CLASS,
  DIAGNOSTICS_IDLE_CLASS,
  DIAGNOSTICS_PAGE_GRID_CLASS,
  DIAGNOSTICS_STATUS_ROW_CLASS,
  DIAGNOSTICS_SUMMARY_CLASS,
} from "./diagnostics-layout";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  ErrorBlock,
  LoadingBlock,
  titleCase,
  useApiResource,
} from "./lib";

interface DoctorResponse {
  checks?: unknown[];
}

export function doctorResourcePath(
  active: boolean,
  requested: boolean,
): "/doctor" | null {
  return active && requested ? "/doctor" : null;
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

export function doctorResultState(
  requested: boolean,
  loading: boolean,
  error: string,
  checks: DoctorCheckView[],
): "idle" | "loading" | "error" | "empty" | "results" {
  if (!requested) return "idle";
  if (loading) return "loading";
  if (error) return "error";
  return checks.length ? "results" : "empty";
}

function DoctorCheckRow({ check }: { check: DoctorCheckView }) {
  return (
    <div className={DIAGNOSTICS_STATUS_ROW_CLASS}>
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
  const version = import.meta.env.VITE_DOOLITTLE_DESKTOP_VERSION;
  const homepage = import.meta.env.VITE_DOOLITTLE_DESKTOP_HOMEPAGE;
  const [doctorRequested, setDoctorRequested] = useState(false);
  const doctorPath = doctorResourcePath(active, doctorRequested);
  const doctor = useApiResource<DoctorResponse>(doctorPath, [doctorPath]);
  const checks = normalizeDoctorChecks(doctor.data);
  const prioritizedChecks = prioritizeDoctorChecks(checks, 5);
  const resultState = doctorResultState(
    doctorRequested,
    doctor.loading,
    doctor.error,
    checks,
  );
  const passing = checks.filter((check) =>
    ["pass", "ready", "ok"].includes(asString(check.status).toLowerCase()),
  ).length;

  return (
    <div className="settings-embedded-section" data-settings-embedded="true">
      <header className="settings-section-header">
        <div>
          <span className="eyebrow">Help</span>
          <h2>About Doolittle</h2>
          <p>Doolittle Desktop {version}</p>
        </div>
      </header>
      <CompactStatStrip
        label="Application summary"
        stats={[
          { label: "Runtime transport", value: "Loopback" },
          { label: "Desktop bridge", value: "Sandboxed", tone: "good" },
          { label: "Storage", value: "Local" },
          {
            label: "Diagnostics",
            value: !active
              ? "Offline"
              : doctorRequested
                ? `${passing}/${checks.length}`
                : "On demand",
            tone:
              active && doctorRequested && !doctor.loading && checks.length
                ? passing === checks.length
                  ? "good"
                  : "warn"
                : "neutral",
          },
        ]}
      />
      <div className={DIAGNOSTICS_PAGE_GRID_CLASS}>
        <section className={DIAGNOSTICS_CARD_CLASS}>
          <div className={DIAGNOSTICS_CARD_HEADING_CLASS}>
            <div>
              <span className="eyebrow">Runtime doctor</span>
              <h2>System checks</h2>
            </div>
            <Button
              disabled={!active}
              onClick={() => {
                if (doctorRequested) doctor.reload();
                else setDoctorRequested(true);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {doctorRequested ? "Run again" : "Run diagnostics"}
            </Button>
          </div>
          {!active ? (
            <OfflineRouteState>
              Runtime diagnostics are unavailable until the local runtime is
              ready.
            </OfflineRouteState>
          ) : resultState === "idle" ? (
            <div className={DIAGNOSTICS_IDLE_CLASS}>
              <strong>Checks are ready when you need them.</strong>
              <small>
                Doolittle avoids probing providers and local services just to
                open this page.
              </small>
            </div>
          ) : resultState === "loading" ? (
            <LoadingBlock label="Running local operator diagnostics…" />
          ) : resultState === "error" ? (
            <ErrorBlock error={doctor.error} retry={doctor.reload} />
          ) : resultState === "empty" ? (
            <div
              aria-live="polite"
              className={DIAGNOSTICS_IDLE_CLASS}
              data-doctor-state="empty"
              role="status"
            >
              <strong>No diagnostic results were returned.</strong>
              <small>
                The local runtime completed the request without reporting
                individual checks. Run again to retry the local probe.
              </small>
            </div>
          ) : (
            <div className="grid">
              {prioritizedChecks.visible.map((check) => (
                <DoctorCheckRow check={check} key={check.id} />
              ))}
            </div>
          )}
          {active && prioritizedChecks.remaining.length ? (
            <details className="group overflow-hidden">
              <summary className="cursor-pointer list-none py-[9px] font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--text-soft)] [&::-webkit-details-marker]:hidden">
                <UiIcon
                  className={DIAGNOSTICS_CHEVRON_CLASS}
                  icon={ChevronRight}
                  size="xs"
                />{" "}
                {prioritizedChecks.remaining.length} more checks
              </summary>
              <div className="grid">
                {prioritizedChecks.remaining.map((check) => (
                  <DoctorCheckRow check={check} key={check.id} />
                ))}
              </div>
            </details>
          ) : null}
        </section>
        <section className={DIAGNOSTICS_CARD_CLASS}>
          <div className={DIAGNOSTICS_CARD_HEADING_CLASS}>
            <div>
              <h2>Support and release notes</h2>
            </div>
          </div>
          <nav aria-label="Doolittle support" className="grid gap-1">
            {[
              ["Read the documentation", homepage],
              ["View release notes", `${homepage}/releases`],
              ["Report an issue", `${homepage}/issues`],
            ].map(([label, href]) => (
              <a
                className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-sm hover:bg-[var(--surface-hover)]"
                href={href}
                key={label}
                rel="noreferrer"
                target="_blank"
              >
                {label}
                <UiIcon icon={ExternalLink} size="xs" />
              </a>
            ))}
          </nav>
          {import.meta.env.DEV ? (
            <details className="border-t border-[var(--border)] pt-2 text-sm">
              <summary className="cursor-pointer">Development commands</summary>
              <p>
                <code>nub run desktop:dev</code> starts the desktop from source.
              </p>
              <p>
                <code>doolittle doctor</code> checks runtime and provider
                readiness.
              </p>
            </details>
          ) : null}
        </section>
      </div>
      <details
        className={`architecture-disclosure ${DIAGNOSTICS_DETAILS_CLASS}`}
      >
        <summary className={DIAGNOSTICS_SUMMARY_CLASS}>
          <UiIcon
            className={DIAGNOSTICS_CHEVRON_CLASS}
            icon={ChevronRight}
            size="xs"
          />
          <span className="grid min-w-0 flex-1 gap-1">
            <strong>Desktop security boundary</strong>
            <small className="text-[length:var(--text-meta)] text-[var(--muted)]">
              Renderer → preload → Electron → local runtime
            </small>
          </span>
          <span className="font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
            Inspect
          </span>
        </summary>
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-3 border-t border-[var(--border)] p-[var(--card-pad)] max-[760px]:grid-cols-1 max-[760px]:[&_i]:rotate-90">
          <div className="grid gap-1 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--bg)] p-3">
            <strong>React renderer</strong>
            <span className="text-[length:var(--text-meta)] text-[var(--muted)]">
              Sandboxed UI
            </span>
          </div>
          <UiIcon
            className="mx-auto text-[var(--accent)]"
            icon={ArrowRight}
            size="sm"
          />
          <div className="grid gap-1 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--bg)] p-3">
            <strong>Typed preload</strong>
            <span className="text-[length:var(--text-meta)] text-[var(--muted)]">
              Exact endpoint allowlist
            </span>
          </div>
          <UiIcon
            className="mx-auto text-[var(--accent)]"
            icon={ArrowRight}
            size="sm"
          />
          <div className="grid gap-1 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--bg)] p-3">
            <strong>Electron main</strong>
            <span className="text-[length:var(--text-meta)] text-[var(--muted)]">
              Private IPC
            </span>
          </div>
          <UiIcon
            className="mx-auto text-[var(--accent)]"
            icon={ArrowRight}
            size="sm"
          />
          <div className="grid gap-1 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--bg)] p-3">
            <strong>Doolittle runtime</strong>
            <span className="text-[length:var(--text-meta)] text-[var(--muted)]">
              127.0.0.1 ephemeral port
            </span>
          </div>
        </div>
      </details>
    </div>
  );
}
