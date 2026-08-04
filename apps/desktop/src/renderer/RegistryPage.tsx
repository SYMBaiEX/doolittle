import { useMemo, useState } from "react";
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

export function RegistryPage({ active }: { active: boolean }) {
  const [query, setQuery] = useState("");
  const [refreshRequested, setRefreshRequested] = useState(false);
  const params = useMemo(() => {
    const next = new URLSearchParams();
    const normalized = query.trim();
    if (normalized) {
      next.set("query", normalized);
    }
    if (refreshRequested) {
      next.set("refresh", "true");
    }
    return next.toString();
  }, [query, refreshRequested]);
  const path = params ? `/runtime/registry?${params}` : "/runtime/registry";
  const registry = useApiResource<UnknownRecord>(active ? path : null, [
    active,
    params,
  ]);
  const entries = asArray(asRecord(registry.data).registries).map(asRecord);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Runtime"
        title="Plugin registry"
        description="Search or refresh the runtime registry and review matching entries."
        actions={
          <button
            className="text-button"
            onClick={registry.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      {active ? (
        <div className="filter-bar">
          <label className="search-field grow">
            <span className="sr-only">Search the plugin registry</span>
            <input
              placeholder="Search by plugin name"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            onClick={() => setRefreshRequested((current) => !current)}
            type="button"
          >
            {refreshRequested ? "Hard refresh" : "Cached lookup"}
          </button>
        </div>
      ) : null}
      {!active ? (
        <EmptyBlock title="Plugin registry is offline">
          Restart the local runtime to search installed and available plugins.
        </EmptyBlock>
      ) : registry.loading ? (
        <LoadingBlock />
      ) : registry.error ? (
        <ErrorBlock error={registry.error} retry={registry.reload} />
      ) : entries.length ? (
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Registry</span>
              <h2>Entries</h2>
            </div>
            <Badge>{entries.length}</Badge>
          </div>
          <div className="stack-list">
            {entries.map((entry, index) => (
              <div className="status-row" key={String(index)}>
                <div>
                  <strong>
                    {asString(entry.name, asString(entry.id, "Entry"))}
                  </strong>
                  <small>
                    {asString(
                      entry.version,
                      asString(entry.source, "No version"),
                    )}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <EmptyBlock
          title="No registry entries"
          actions={
            <button
              className="secondary-button"
              onClick={registry.reload}
              type="button"
            >
              Search again
            </button>
          }
        >
          No registry rows returned for this query.
        </EmptyBlock>
      )}
      {registry.data ? (
        <section className="content-card" style={{ marginTop: "16px" }}>
          <div className="card-heading">
            <div>
              <span className="eyebrow">Raw payload</span>
              <h2>Registry response</h2>
            </div>
          </div>
          <RawDataDisclosure label="Registry payload" value={registry.data} />
        </section>
      ) : null}
    </div>
  );
}
