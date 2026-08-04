import { useState } from "react";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  titleCase,
  useApiResource,
} from "./lib";
import "./agent-pages.css";

interface PluginsResponse {
  catalog?: unknown[];
  grouped?: Record<string, unknown[]>;
  serviceRegistry?: unknown;
  pluginManager?: unknown;
}

export function PluginsPage({ active }: { active: boolean }) {
  const resource = useApiResource<PluginsResponse>(
    active ? "/runtime/plugins" : null,
    [active],
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const entries = asArray(resource.data?.catalog).map(asRecord);
  const categories = [
    "all",
    ...new Set(
      entries.map((entry) => asString(entry.category)).filter(Boolean),
    ),
  ];
  const filtered = entries.filter((entry) => {
    const normalized = query.trim().toLowerCase();
    return (
      (category === "all" || entry.category === category) &&
      (!normalized ||
        [entry.id, entry.packageName, entry.category, entry.notes, entry.source]
          .join(" ")
          .toLowerCase()
          .includes(normalized))
    );
  });
  const enabled = entries.filter((entry) => Boolean(entry.enabled)).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Agent"
        title="Plugins"
        description="Inspect the ElizaOS-native provider, messaging, knowledge, media, and automation packages assembled into this runtime."
        actions={
          <button
            className="secondary-button"
            onClick={resource.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      <div className="metric-grid compact">
        <MetricCard label="Catalog" value={entries.length} />
        <MetricCard label="Enabled" value={enabled} />
        <MetricCard label="Inactive" value={entries.length - enabled} />
        <MetricCard label="Categories" value={categories.length - 1} />
      </div>
      <Notice>
        This page reflects the packages actually assembled by the ElizaOS
        runtime. Provider enablement follows account and environment readiness.
      </Notice>
      <div className="filter-bar">
        <label className="search-field grow">
          <span className="sr-only">Search plugins</span>
          <input
            placeholder="Search plugins"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Plugin category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((value) => (
            <option key={value} value={value}>
              {titleCase(value)}
            </option>
          ))}
        </select>
      </div>
      {resource.loading ? (
        <LoadingBlock label="Inspecting native plugin assembly…" />
      ) : resource.error ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : filtered.length ? (
        <div className="card-grid dense">
          {filtered.map((entry, index) => (
            <article
              className="content-card catalog-card"
              key={asString(entry.id, String(index))}
            >
              <div className="card-heading">
                <div>
                  <span className="eyebrow">
                    {titleCase(asString(entry.category, "plugin"))}
                  </span>
                  <h2>{titleCase(asString(entry.id, "Unnamed plugin"))}</h2>
                </div>
                <Badge tone={entry.enabled ? "good" : "warn"}>
                  {entry.enabled ? "Enabled" : "Inactive"}
                </Badge>
              </div>
              <p>{asString(entry.notes, "No plugin notes available.")}</p>
              <dl className="fact-list compact">
                <div>
                  <dt>Source</dt>
                  <dd>{titleCase(asString(entry.source, "unknown"))}</dd>
                </div>
                <div>
                  <dt>Maturity</dt>
                  <dd>{titleCase(asString(entry.maturity, "unknown"))}</dd>
                </div>
              </dl>
              <div className="card-footer">
                <code>{asString(entry.packageName, asString(entry.id))}</code>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyBlock title="No plugins match">
          Change the search or category filter.
        </EmptyBlock>
      )}
    </div>
  );
}
