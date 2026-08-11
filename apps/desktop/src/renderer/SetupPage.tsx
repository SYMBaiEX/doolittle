import type { AccountPoolResponse } from "../shared/contracts";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  RawDataDisclosure,
  type UnknownRecord,
  useApiResource,
} from "./lib";
import "./diagnostics-pages.css";

export interface SetupChecklistItemView {
  id: string;
  label: string;
  detail: string;
  status: string;
}

export interface SetupSnapshotRow {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "good" | "warn" | "bad";
}

export function normalizeSetupChecklist(
  value: unknown,
): SetupChecklistItemView[] {
  return asArray(asRecord(value).checklist)
    .map((item, index): SetupChecklistItemView | null => {
      if (typeof item === "string") {
        const label = item.trim();
        return label
          ? { id: `guidance-${index}`, label, detail: "", status: "" }
          : null;
      }
      const record = asRecord(item);
      const label = asString(
        record.summary,
        asString(record.label, asString(record.name)),
      ).trim();
      if (!label) return null;
      return {
        id: asString(record.id, `guidance-${index}`),
        label,
        detail: asString(record.detail, asString(record.description)).trim(),
        status: asString(record.status).trim().toLowerCase(),
      };
    })
    .filter((item): item is SetupChecklistItemView => item !== null);
}

function readinessTone(value: string): SetupSnapshotRow["tone"] {
  if (value === "ready") return "good";
  if (value === "blocked") return "bad";
  return value ? "warn" : "neutral";
}

export function normalizeSetupSnapshot(value: unknown): SetupSnapshotRow[] {
  const summary = asRecord(asRecord(value).summary);
  const rows: SetupSnapshotRow[] = [];
  const readiness = asRecord(summary.readiness);
  const readinessLevel = asString(readiness.level).toLowerCase();
  const readinessHeadline = asString(readiness.headline).trim();
  if (readinessHeadline) {
    rows.push({
      id: "readiness",
      label: "Readiness",
      value: readinessHeadline,
      detail: asString(readiness.detail).trim(),
      tone: readinessTone(readinessLevel),
    });
  }

  const version = asRecord(summary.version);
  const versionNumber = asString(version.version).trim();
  if (versionNumber) {
    const environment = [
      asString(version.node).trim()
        ? `Node ${asString(version.node).trim()}`
        : "",
      asString(version.nub).trim() ? `Nub ${asString(version.nub).trim()}` : "",
    ].filter(Boolean);
    rows.push({
      id: "version",
      label: "Runtime version",
      value: versionNumber,
      detail: environment.join(" · "),
      tone: "neutral",
    });
  }

  const addReadinessRow = (id: string, label: string, source: unknown) => {
    const items = asArray(source).map(asRecord);
    if (!items.length) return;
    const ready = items.filter((item) => item.ready === true).length;
    rows.push({
      id,
      label,
      value: `${ready}/${items.length} ready`,
      detail:
        ready === items.length
          ? "All checks passed"
          : "Review unavailable entries",
      tone: ready === items.length ? "good" : "warn",
    });
  };
  addReadinessRow("providers", "Providers", summary.providers);
  addReadinessRow("transports", "Transports", summary.transports);

  const directories = asArray(summary.directories).map(asRecord);
  if (directories.length) {
    const existing = directories.filter(
      (entry) => entry.exists === true,
    ).length;
    rows.push({
      id: "directories",
      label: "Directories",
      value: `${existing}/${directories.length} available`,
      detail:
        existing === directories.length
          ? "Local paths are ready"
          : "Some local paths are missing",
      tone: existing === directories.length ? "good" : "warn",
    });
  }

  const serviceGroups = asArray(summary.nativeServices).map(asRecord);
  if (serviceGroups.length) {
    const services = serviceGroups.reduce((total, group) => {
      const count = group.count;
      return (
        total +
        (typeof count === "number" && Number.isFinite(count)
          ? count
          : asArray(group.services).length)
      );
    }, 0);
    rows.push({
      id: "services",
      label: "Native services",
      value: `${services} available`,
      detail: `${serviceGroups.length} service groups`,
      tone: services ? "good" : "neutral",
    });
  }
  return rows;
}

export function SetupPage({
  active,
  onOpenProviders,
}: {
  active: boolean;
  onOpenProviders?: () => void;
}) {
  const checklist = useApiResource<UnknownRecord>(
    active ? "/setup/checklist" : null,
    [active],
  );
  const summary = useApiResource<UnknownRecord>(
    active ? "/setup/summary" : null,
    [active],
  );
  const accountPool = useApiResource<AccountPoolResponse>(
    active ? "/runtime/account-pool" : null,
    [active],
  );
  const pooledEnabled = Object.values(accountPool.data?.providers ?? {})
    .flatMap((provider) => provider.accounts)
    .filter((account) => account.enabled).length;
  const checklistItems = normalizeSetupChecklist(checklist.data);
  const summaryEntries = normalizeSetupSnapshot(summary.data);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operator"
        title="Setup"
        description="Track local setup health and onboarding checklist status."
      />
      {!active ? (
        <EmptyBlock title="Setup checks are offline">
          Restart the local runtime to inspect onboarding and readiness.
        </EmptyBlock>
      ) : (
        <>
          <div className="two-column-grid">
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Optional for delegated work</span>
                  <h2>Spawned-agent accounts</h2>
                </div>
                <button
                  className="text-button"
                  disabled={!onOpenProviders}
                  onClick={onOpenProviders}
                  type="button"
                >
                  Providers &amp; accounts
                </button>
              </div>
              {accountPool.loading ? (
                <LoadingBlock />
              ) : accountPool.error ? (
                <ErrorBlock
                  error={accountPool.error}
                  retry={accountPool.reload}
                />
              ) : (
                <div className="status-row">
                  <div>
                    <strong>{pooledEnabled} enabled account(s)</strong>
                    <small>
                      Add Codex or Claude accounts to rotate spawned build and
                      research sessions. This does not change the conversation
                      model above.
                    </small>
                  </div>
                  <Badge tone={pooledEnabled ? "good" : "neutral"}>
                    {pooledEnabled ? "Available" : "Optional"}
                  </Badge>
                </div>
              )}
            </section>
            <section className="content-card setup-snapshot">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Summary</span>
                  <h2>Setup snapshot</h2>
                </div>
                <button
                  className="text-button"
                  onClick={summary.reload}
                  type="button"
                >
                  Refresh
                </button>
              </div>
              {summary.loading ? (
                <LoadingBlock />
              ) : summary.error ? (
                <ErrorBlock error={summary.error} retry={summary.reload} />
              ) : summaryEntries.length ? (
                <div className="stack-list">
                  {summaryEntries.map((entry) => (
                    <div className="status-row" key={entry.id}>
                      <div>
                        <strong>{entry.label}</strong>
                        <small>{entry.value}</small>
                        {entry.detail ? <small>{entry.detail}</small> : null}
                      </div>
                      <Badge tone={entry.tone}>
                        {entry.tone === "good"
                          ? "Ready"
                          : entry.tone === "warn"
                            ? "Review"
                            : entry.tone === "bad"
                              ? "Blocked"
                              : "Info"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBlock title="No summary payload">
                  No setup summary is available.
                </EmptyBlock>
              )}
              {summary.data ? (
                <RawDataDisclosure
                  label="Inspect raw setup response"
                  value={summary.data}
                />
              ) : null}
            </section>
          </div>
          <details className="content-card setup-guidance">
            <summary>
              <span>
                <span className="eyebrow">Checklist</span>
                <strong>Configuration guidance</strong>
              </span>
              <span className="setup-guidance__meta">
                {checklist.loading
                  ? "Loading…"
                  : `${checklistItems.length} items`}
              </span>
            </summary>
            <div className="setup-guidance__body">
              <div className="setup-guidance__toolbar">
                <p>
                  Reference steps for optional providers, transports, and remote
                  execution.
                </p>
                <button
                  className="text-button"
                  onClick={checklist.reload}
                  type="button"
                >
                  Refresh
                </button>
              </div>
              {checklist.error ? (
                <ErrorBlock error={checklist.error} retry={checklist.reload} />
              ) : checklistItems.length ? (
                <ol className="setup-guidance__list">
                  {checklistItems.map((entry) => (
                    <li key={entry.id}>
                      <span>{entry.label}</span>
                      {entry.detail ? <small>{entry.detail}</small> : null}
                      {entry.status ? (
                        <Badge
                          tone={
                            entry.status === "done" || entry.status === "pass"
                              ? "good"
                              : "warn"
                          }
                        >
                          {entry.status}
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : checklist.loading ? (
                <LoadingBlock />
              ) : (
                <EmptyBlock title="No checklist items">
                  No setup guidance was returned.
                </EmptyBlock>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
