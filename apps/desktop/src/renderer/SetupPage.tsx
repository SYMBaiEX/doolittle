import { Button } from "@elizaos/ui/components/ui/button";
import { useState } from "react";
import type { AccountPoolResponse } from "../shared/contracts";
import { CompactStatStrip } from "./components/CompactStatStrip";
import {
  DIAGNOSTICS_CHEVRON_CLASS,
  DIAGNOSTICS_DETAILS_CLASS,
  DIAGNOSTICS_SUMMARY_CLASS,
  SETUP_ACCOUNT_BAR_CLASS,
  SETUP_GUIDANCE_BODY_CLASS,
  SETUP_GUIDANCE_ITEM_CLASS,
  SETUP_GUIDANCE_LIST_CLASS,
  SETUP_GUIDANCE_TOOLBAR_CLASS,
} from "./diagnostics-layout";
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
            <Button
              onClick={() => {
                accountPool.reload();
                summary.reload();
                if (requestPolicy.checklist) checklist.reload();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Refresh
            </Button>
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
          <section className={SETUP_ACCOUNT_BAR_CLASS}>
            <div className="grid min-w-0 gap-0.5">
              <span className="eyebrow">Optional extension</span>
              <strong className="font-[var(--font-display)] text-[15px] text-[var(--text)]">
                Subscription account pools
              </strong>
              <small className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-meta)] text-[var(--muted)]">
                Route delegated coding work across linked accounts.
              </small>
            </div>
            <div className="flex shrink-0 items-center gap-2.5 max-[700px]:justify-between">
              {accountPool.loading ? (
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-meta)] text-[var(--muted)]">
                  Checking…
                </span>
              ) : accountPool.error ? (
                <Badge tone="warn">Unavailable</Badge>
              ) : (
                <Badge tone={pooledEnabled ? "good" : "neutral"}>
                  {pooledEnabled
                    ? `${pooledEnabled} enabled`
                    : "Not configured"}
                </Badge>
              )}
              <Button
                disabled={!onOpenProviders}
                onClick={onOpenProviders}
                size="sm"
                type="button"
                variant="ghost"
              >
                Manage accounts
              </Button>
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
            className={`setup-guidance ${DIAGNOSTICS_DETAILS_CLASS}`}
            onToggle={(event) => setChecklistOpen(event.currentTarget.open)}
          >
            <summary className={DIAGNOSTICS_SUMMARY_CLASS}>
              <span aria-hidden="true" className={DIAGNOSTICS_CHEVRON_CLASS}>
                ›
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="eyebrow">Checklist</span>
                <strong>Configuration guidance</strong>
              </span>
              <span className="font-[var(--font-mono)] text-[var(--text-meta)] text-[var(--muted)]">
                {!checklistOpen
                  ? "Open to load"
                  : checklist.loading
                    ? "Loading…"
                    : `${checklistItems.length} items`}
              </span>
            </summary>
            {checklistOpen ? (
              <div className={SETUP_GUIDANCE_BODY_CLASS}>
                <div className={SETUP_GUIDANCE_TOOLBAR_CLASS}>
                  <p>
                    Reference steps for optional providers, transports, and
                    remote execution.
                  </p>
                  <Button
                    onClick={checklist.reload}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Refresh
                  </Button>
                </div>
                {checklist.error ? (
                  <ErrorBlock
                    error={checklist.error}
                    retry={checklist.reload}
                  />
                ) : checklistItems.length ? (
                  <ol className={SETUP_GUIDANCE_LIST_CLASS}>
                    {checklistItems.map((entry, index) => (
                      <li className={SETUP_GUIDANCE_ITEM_CLASS} key={entry.id}>
                        <span className="font-[var(--font-mono)] text-[var(--text-meta)] text-[var(--accent)]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span>{entry.label}</span>
                        {entry.detail ? (
                          <small className="col-start-2 text-[var(--muted)]">
                            {entry.detail}
                          </small>
                        ) : null}
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
