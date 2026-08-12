import { useState } from "react";
import type { AccountPoolResponse } from "../shared/contracts";
import { CompactStatStrip } from "./components/CompactStatStrip";
import {
  Badge,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  RawDataDisclosure,
  type UnknownRecord,
  useApiResource,
} from "./lib";
import { setupRequests } from "./resource-request-policy";
import { SetupReadinessPanel } from "./setup/SetupReadinessPanel";
import {
  normalizeSetupChecklist,
  normalizeSetupReadiness,
  normalizeSetupSnapshot,
  selectPrimarySetupSnapshot,
} from "./setup/setup-model";
import "./diagnostics-pages.css";

export {
  normalizeSetupChecklist,
  normalizeSetupReadiness,
  normalizeSetupSnapshot,
  selectPrimarySetupSnapshot,
} from "./setup/setup-model";

export function SetupPage({
  active,
  onOpenProviders,
}: {
  active: boolean;
  onOpenProviders?: () => void;
}) {
  const [checklistOpen, setChecklistOpen] = useState(false);
  const requestPolicy = setupRequests({ active, checklistOpen });
  const checklist = useApiResource<UnknownRecord>(
    requestPolicy.checklist ? "/setup/checklist" : null,
    [requestPolicy.checklist],
  );
  const summary = useApiResource<UnknownRecord>(
    requestPolicy.primary ? "/setup/summary" : null,
    [requestPolicy.primary],
  );
  const accountPool = useApiResource<AccountPoolResponse>(
    requestPolicy.primary ? "/runtime/account-pool" : null,
    [requestPolicy.primary],
  );
  const pooledEnabled = Object.values(accountPool.data?.providers ?? {})
    .flatMap((provider) => provider.accounts)
    .filter((account) => account.enabled).length;
  const checklistItems = normalizeSetupChecklist(checklist.data);
  const readiness = normalizeSetupReadiness(summary.data);
  const summaryEntries = normalizeSetupSnapshot(summary.data);
  const primarySummaryEntries = selectPrimarySetupSnapshot(summaryEntries);

  return (
    <div className="page">
      <PageHeader
        actions={
          active ? (
            <button
              className="text-button"
              onClick={() => {
                accountPool.reload();
                summary.reload();
                if (requestPolicy.checklist) checklist.reload();
              }}
              type="button"
            >
              Refresh
            </button>
          ) : null
        }
        eyebrow="Operator"
        title="Setup"
        description="Confirm local readiness, then configure optional extensions."
      />
      {!active ? (
        <EmptyBlock title="Setup checks are offline">
          Restart the local runtime to inspect onboarding and readiness.
        </EmptyBlock>
      ) : (
        <>
          {summary.loading ? (
            <LoadingBlock />
          ) : summary.error ? (
            <ErrorBlock error={summary.error} retry={summary.reload} />
          ) : readiness ? (
            <>
              <SetupReadinessPanel readiness={readiness} />
              {primarySummaryEntries.length ? (
                <CompactStatStrip
                  label="Core readiness"
                  stats={primarySummaryEntries.map((entry) => ({
                    detail: entry.detail,
                    label: entry.label,
                    tone: entry.tone,
                    value: entry.value,
                  }))}
                />
              ) : null}
            </>
          ) : (
            <EmptyBlock title="No summary payload">
              No setup summary is available.
            </EmptyBlock>
          )}
          <section className="setup-account-bar">
            <div className="setup-account-bar__copy">
              <span className="eyebrow">Optional extension</span>
              <strong>Subscription account pools</strong>
              <small>Route delegated coding work across linked accounts.</small>
            </div>
            <div className="setup-account-bar__actions">
              {accountPool.loading ? (
                <span className="setup-account-bar__state">Checking…</span>
              ) : accountPool.error ? (
                <Badge tone="warn">Unavailable</Badge>
              ) : (
                <Badge tone={pooledEnabled ? "good" : "neutral"}>
                  {pooledEnabled
                    ? `${pooledEnabled} enabled`
                    : "Not configured"}
                </Badge>
              )}
              <button
                className="text-button"
                disabled={!onOpenProviders}
                onClick={onOpenProviders}
                type="button"
              >
                Manage accounts
              </button>
            </div>
          </section>
          {accountPool.error ? (
            <ErrorBlock error={accountPool.error} retry={accountPool.reload} />
          ) : null}
          {summary.data ? (
            <RawDataDisclosure
              label="Inspect raw setup response"
              value={summary.data}
            />
          ) : null}
          <details
            className="content-card setup-guidance"
            onToggle={(event) => setChecklistOpen(event.currentTarget.open)}
          >
            <summary>
              <span>
                <span className="eyebrow">Checklist</span>
                <strong>Configuration guidance</strong>
              </span>
              <span className="setup-guidance__meta">
                {!checklistOpen
                  ? "Open to load"
                  : checklist.loading
                    ? "Loading…"
                    : `${checklistItems.length} items`}
              </span>
            </summary>
            {checklistOpen ? (
              <div className="setup-guidance__body">
                <div className="setup-guidance__toolbar">
                  <p>
                    Reference steps for optional providers, transports, and
                    remote execution.
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
                  <ErrorBlock
                    error={checklist.error}
                    retry={checklist.reload}
                  />
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
            ) : null}
          </details>
        </>
      )}
    </div>
  );
}
