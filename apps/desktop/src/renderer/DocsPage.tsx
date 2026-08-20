import { Button } from "@elizaos/ui/components/ui/button";
import { ArrowRight, ChevronRight } from "lucide-react";
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
  PageHeader,
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
  const [doctorRequested, setDoctorRequested] = useState(false);
  const doctorPath = doctorResourcePath(active, doctorRequested);
  const doctor = useApiResource<DoctorResponse>(doctorPath, [doctorPath]);
  const checks = normalizeDoctorChecks(doctor.data);
  const prioritizedChecks = prioritizeDoctorChecks(checks, 5);
  const passing = checks.filter((check) =>
    ["pass", "ready", "ok"].includes(asString(check.status).toLowerCase()),
  ).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Help"
        title="About Doolittle"
        description="Private ElizaOS workspace, local runtime status, and operator diagnostics."
      />
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
          ) : !doctorRequested ? (
            <div className={DIAGNOSTICS_IDLE_CLASS}>
              <strong>Checks are ready when you need them.</strong>
              <small>
                Doolittle avoids probing providers and local services just to
                open this page.
              </small>
            </div>
          ) : doctor.loading ? (
            <LoadingBlock />
          ) : doctor.error ? (
            <ErrorBlock error={doctor.error} retry={doctor.reload} />
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
              <span className="eyebrow">Quick reference</span>
              <h2>Run Doolittle</h2>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="grid gap-1 border-t border-[var(--border)] pt-2 first:border-t-0 first:pt-0">
              <code className="text-[length:var(--text-control)] text-[var(--accent)]">
                ./scripts/install.sh
              </code>
              <span className="text-[length:var(--text-meta)] text-[var(--muted)]">
                Install or update the local command.
              </span>
            </div>
            <div className="grid gap-1 border-t border-[var(--border)] pt-2">
              <code className="text-[length:var(--text-control)] text-[var(--accent)]">
                doolittle desktop
              </code>
              <span className="text-[length:var(--text-meta)] text-[var(--muted)]">
                Open this desktop application.
              </span>
            </div>
            <div className="grid gap-1 border-t border-[var(--border)] pt-2">
              <code className="text-[length:var(--text-control)] text-[var(--accent)]">
                doolittle doctor
              </code>
              <span className="text-[length:var(--text-meta)] text-[var(--muted)]">
                Check runtime and provider readiness.
              </span>
            </div>
            <div className="grid gap-1 border-t border-[var(--border)] pt-2">
              <code className="text-[length:var(--text-control)] text-[var(--accent)]">
                doolittle
              </code>
              <span className="text-[length:var(--text-meta)] text-[var(--muted)]">
                Open the terminal interface.
              </span>
            </div>
          </div>
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
