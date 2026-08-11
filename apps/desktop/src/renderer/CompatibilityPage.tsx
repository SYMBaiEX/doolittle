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

export function CompatibilityPage({ active }: { active: boolean }) {
  const compatibility = useApiResource<UnknownRecord>(
    active ? "/runtime/compatibility" : null,
    [active],
  );
  const checks = asArray(asRecord(compatibility.data).checks).map(asRecord);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Runtime"
        title="Compatibility"
        description="Review compatibility diagnostics for provider and runtime readiness."
        actions={
          <button
            className="text-button"
            onClick={compatibility.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      {!active ? (
        <EmptyBlock title="Compatibility checks are offline">
          Restart the local runtime to inspect provider and runtime readiness.
        </EmptyBlock>
      ) : compatibility.loading ? (
        <LoadingBlock />
      ) : compatibility.error ? (
        <ErrorBlock error={compatibility.error} retry={compatibility.reload} />
      ) : checks.length ? (
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Checks</span>
              <h2>Runtime compatibility</h2>
            </div>
            <Badge>{checks.length}</Badge>
          </div>
          <div className="stack-list">
            {checks.map((check, index) => {
              const status = asString(check.status, "unknown");
              return (
                <div className="status-row" key={String(index)}>
                  <div>
                    <strong>{asString(check.name, "Check")}</strong>
                    <small>
                      {asString(
                        check.message,
                        asString(check.detail, "No details"),
                      )}
                    </small>
                  </div>
                  <Badge
                    tone={
                      ["pass", "ready", "ok"].includes(status.toLowerCase())
                        ? "good"
                        : status.toLowerCase() === "warn"
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
        </section>
      ) : (
        <EmptyBlock
          title="No compatibility checks found"
          actions={
            <button
              className="secondary-button"
              onClick={compatibility.reload}
              type="button"
            >
              Run checks again
            </button>
          }
        >
          The runtime did not return a checks payload.
        </EmptyBlock>
      )}
      {compatibility.data ? (
        <RawDataDisclosure
          label="Raw compatibility report"
          value={compatibility.data}
        />
      ) : null}
    </div>
  );
}
