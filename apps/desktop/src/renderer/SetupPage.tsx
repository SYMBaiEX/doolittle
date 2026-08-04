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
  titleCase,
  type UnknownRecord,
  useApiResource,
} from "./lib";

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
  const checklistItems = asArray(asRecord(checklist.data).checklist).map(
    asRecord,
  );
  const summaryPayload = asRecord(summary.data);
  const summaryEntries = Object.entries(asRecord(summaryPayload.summary));

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
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Checklist</span>
                  <h2>Readiness items</h2>
                </div>
                <button
                  className="text-button"
                  onClick={checklist.reload}
                  type="button"
                >
                  Refresh
                </button>
              </div>
              {checklist.loading ? (
                <LoadingBlock />
              ) : checklist.error ? (
                <ErrorBlock error={checklist.error} retry={checklist.reload} />
              ) : checklistItems.length ? (
                <div className="stack-list">
                  {checklistItems.map((entry, index) => {
                    const status = asString(entry.status, "pending");
                    const done = status.toLowerCase() === "done";
                    return (
                      <div className="status-row" key={String(index)}>
                        <div>
                          <strong>
                            {asString(
                              entry.label,
                              asString(entry.name, "Item"),
                            )}
                          </strong>
                          <small>
                            {asString(entry.description, "No details")}
                          </small>
                        </div>
                        <Badge tone={done ? "good" : "warn"}>
                          {done ? "Done" : "Pending"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyBlock title="No checklist items">
                  No setup checklist items were returned.
                </EmptyBlock>
              )}
            </section>
            <section className="content-card">
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
                  {summaryEntries.map(([key, value]) => (
                    <div className="status-row" key={key}>
                      <div>
                        <strong>{titleCase(key)}</strong>
                        <small>{String(value)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBlock title="No summary payload">
                  No setup summary is available.
                </EmptyBlock>
              )}
            </section>
          </div>
          {summary.data ? (
            <section className="content-card" style={{ marginTop: "16px" }}>
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Raw payload</span>
                  <h2>Setup response</h2>
                </div>
              </div>
              <RawDataDisclosure
                label="Setup summary payload"
                value={summary.data}
              />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
