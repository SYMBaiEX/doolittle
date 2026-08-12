import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@elizaos/ui/components/ui/select";
import { useState } from "react";
import {
  CompactCatalogList,
  catalogExceptionStatus,
} from "./components/CompactCatalogList";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  asArray,
  asRecord,
  asString,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  titleCase,
  useApiResource,
} from "./lib";
import "./agent-pages.css";
import "./plugins.css";

interface PluginsResponse {
  catalog?: unknown[];
  grouped?: Record<string, unknown[]>;
  serviceRegistry?: unknown;
  pluginManager?: unknown;
}

export function PluginsPage({ active }: { active: boolean }) {
  const resource = useApiResource<PluginsResponse>(
    active ? "/runtime/plugins?view=catalog" : null,
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
  const catalogEntries = filtered.map((entry, index) => {
    const id = asString(entry.id, `plugin-${index}`);
    return {
      id,
      eyebrow: titleCase(asString(entry.category, "plugin")),
      title: titleCase(id || "Unnamed plugin"),
      description: asString(entry.notes, "No plugin notes available."),
      descriptionMode: "details" as const,
      ...catalogExceptionStatus(Boolean(entry.enabled), "Inactive"),
      code: asString(entry.packageName, id),
      meta: titleCase(asString(entry.source, "unknown")),
      facts: [
        {
          label: "Source",
          value: titleCase(asString(entry.source, "unknown")),
        },
        {
          label: "Maturity",
          value: titleCase(asString(entry.maturity, "unknown")),
        },
      ],
    };
  });
  const enabled = entries.filter((entry) => Boolean(entry.enabled)).length;

  return (
    <PagePanel className="page plugins-page" variant="workspace">
      <PageHeader
        eyebrow="Agent"
        title="Plugins"
        description="Inspect the ElizaOS packages assembled into this runtime."
        actions={
          <Button
            className="secondary-button"
            disabled={!active}
            onClick={resource.reload}
            type="button"
            variant="secondary"
          >
            Refresh
          </Button>
        }
      />
      {!active ? (
        <OfflineRouteState>
          Plugin assembly is unavailable until the local runtime is ready.
        </OfflineRouteState>
      ) : null}
      {active ? (
        <div className="plugins-catalog-controls">
          <CompactStatStrip
            label="Plugin catalog summary"
            stats={[
              { label: "Catalog", value: entries.length },
              { label: "Enabled", value: enabled, tone: "good" },
              {
                label: "Inactive",
                value: entries.length - enabled,
                tone: entries.length - enabled ? "warn" : "neutral",
              },
              { label: "Categories", value: categories.length - 1 },
            ]}
          />
          <div className="filter-bar plugins-filter-bar">
            <label className="search-field grow" htmlFor="plugin-search">
              <span className="sr-only">Search plugins</span>
              <Input
                id="plugin-search"
                placeholder="Search plugins"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Plugin category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((value) => (
                  <SelectItem key={value} value={value}>
                    {titleCase(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}
      {active ? (
        resource.loading ? (
          <LoadingBlock label="Inspecting native plugin assembly…" />
        ) : resource.error ? (
          <ErrorBlock error={resource.error} retry={resource.reload} />
        ) : filtered.length ? (
          <CompactCatalogList
            ariaLabel="Plugin catalog"
            entries={catalogEntries}
            resetKey={`${category}:${query.trim().toLowerCase()}`}
          />
        ) : (
          <EmptyBlock title="No plugins match">
            Change the search or category filter.
          </EmptyBlock>
        )
      ) : null}
    </PagePanel>
  );
}
