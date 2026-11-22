import {
  Activity,
  BookOpen,
  Bug,
  ExternalLink,
  FileText,
  LifeBuoy,
  ShieldCheck,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { UiIcon } from "./components/UiIcon";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "./components/workbench/Workbench";
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
import {
  DiagnosticDisclosure,
  DiagnosticStatusRow,
  DiagnosticWorkspace,
} from "./runtime-state/DiagnosticWorkspace";

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
  const healthy = ["pass", "ready", "ok"].includes(check.status);
  return (
    <DiagnosticStatusRow
      title={check.label}
      detail={check.detail}
      status={
        <Badge
          tone={healthy ? "good" : check.status === "warn" ? "warn" : "bad"}
        >
          {titleCase(check.status)}
        </Badge>
      }
    />
  );
}

const SECURITY_BOUNDARY_STEPS = [
  { title: "React renderer", detail: "Sandboxed UI" },
  { title: "Typed preload", detail: "Exact endpoint allowlist" },
  { title: "Electron main", detail: "Private IPC" },
  { title: "Doolittle runtime", detail: "127.0.0.1 ephemeral port" },
];

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

  const resources = [
    { label: "Read the documentation", href: homepage, icon: BookOpen },
    {
      label: "View release notes",
      href: `${homepage}/releases`,
      icon: FileText,
    },
    { label: "Report an issue", href: `${homepage}/issues`, icon: Bug },
  ];

  return (
    <DiagnosticWorkspace
      description={
        version ? `Doolittle Desktop ${version}` : "Doolittle Desktop"
      }
      icon={LifeBuoy}
      title="About Doolittle"
    >
      <div className="diagnostic-workspace__stats">
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
                : resultState === "loading"
                  ? "Running…"
                  : resultState === "error"
                    ? "Failed"
                    : resultState === "empty"
                      ? "No results"
                      : resultState === "results"
                        ? `${passing}/${checks.length}`
                        : "On demand",
              tone:
                resultState === "error"
                  ? "bad"
                  : resultState === "results" && active
                    ? passing === checks.length
                      ? "good"
                      : "warn"
                    : "neutral",
            },
          ]}
        />
      </div>
      <div className="diagnostic-workspace__grid">
        <WorkbenchSection
          title="System checks"
          headingLevel={3}
          description="Check the runtime, provider connections, and local services."
          icon={Activity}
          actions={
            <WorkbenchAction
              disabled={!active || resultState === "loading"}
              emphasis="primary"
              icon={Activity}
              onClick={() => {
                if (doctorRequested) doctor.reload();
                else setDoctorRequested(true);
              }}
            >
              {doctorRequested ? "Run again" : "Run diagnostics"}
            </WorkbenchAction>
          }
        >
          {!active ? (
            <OfflineRouteState>
              Runtime diagnostics are unavailable until the local runtime is
              ready.
            </OfflineRouteState>
          ) : resultState === "idle" ? (
            <WorkbenchEmpty title="Diagnostics are ready" icon={Activity}>
              Run a local check when a connection or service needs attention.
            </WorkbenchEmpty>
          ) : resultState === "loading" ? (
            <LoadingBlock label="Running local operator diagnostics…" />
          ) : resultState === "error" ? (
            <ErrorBlock error={doctor.error} retry={doctor.reload} />
          ) : resultState === "empty" ? (
            <div data-doctor-state="empty" role="status">
              <WorkbenchEmpty
                title="No diagnostic results"
                icon={TriangleAlert}
              >
                The runtime returned no individual checks. Run again to retry.
              </WorkbenchEmpty>
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="grid gap-1">
                {prioritizedChecks.visible.map((check) => (
                  <DoctorCheckRow check={check} key={check.id} />
                ))}
              </div>
              {prioritizedChecks.remaining.length ? (
                <DiagnosticDisclosure
                  icon={Activity}
                  title={`${prioritizedChecks.remaining.length} more checks`}
                >
                  <div className="grid gap-1">
                    {prioritizedChecks.remaining.map((check) => (
                      <DoctorCheckRow check={check} key={check.id} />
                    ))}
                  </div>
                </DiagnosticDisclosure>
              ) : null}
            </div>
          )}
        </WorkbenchSection>

        <WorkbenchSection
          title="Support and release notes"
          headingLevel={3}
          icon={LifeBuoy}
        >
          <nav aria-label="Doolittle support">
            <ul className="diagnostic-support-links">
              {resources.map(({ label, href, icon }) => (
                <li key={label}>
                  <a href={href} rel="noreferrer" target="_blank">
                    <UiIcon icon={icon} size="md" />
                    <span>{label}</span>
                    <UiIcon icon={ExternalLink} size="xs" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {import.meta.env.DEV ? (
            <DiagnosticDisclosure icon={Terminal} title="Development commands">
              <p className="m-0">
                <code>nub run desktop:dev</code> starts the desktop from source.
              </p>
              <p className="m-0">
                <code>doolittle doctor</code> checks runtime and provider
                readiness.
              </p>
            </DiagnosticDisclosure>
          ) : null}
        </WorkbenchSection>
      </div>

      <DiagnosticDisclosure
        description="How the desktop UI reaches the local runtime"
        icon={ShieldCheck}
        title="Desktop security boundary"
      >
        <ol className="diagnostic-security-steps">
          {SECURITY_BOUNDARY_STEPS.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.detail}</span>
            </li>
          ))}
        </ol>
      </DiagnosticDisclosure>
    </DiagnosticWorkspace>
  );
}
