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
import type { PluginsResponse } from "../shared/contracts";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  asArray,
  asRecord,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  titleCase,
  useApiResource,
} from "./lib";
import { PluginCatalogWorkspace } from "./plugins/PluginCatalogWorkspace";
import { buildPluginCatalogEntries } from "./plugins/plugin-catalog-model";

export function PluginsPage({ active }: { active: boolean }) {
  const resource = useApiResource<PluginsResponse>(
    active ? "/runtime/plugins?view=catalog" : null,
    [active],
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const entries = buildPluginCatalogEntries(
    asArray(resource.data?.catalog).map(asRecord),
  );
  const categories = [
    "all",
    ...new Set(entries.map((entry) => entry.category).filter(Boolean)),
  ];
  const filtered = entries.filter((entry) => {
    const normalized = query.trim().toLowerCase();
    return (
      (category === "all" || entry.category === category) &&
      (!normalized ||
        [
          entry.id,
          entry.title,
          entry.packageName,
          entry.category,
          entry.description,
          entry.source,
          entry.kind,
          entry.maturity,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized))
    );
  });
  const enabled = entries.filter((entry) => entry.enabled).length;

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
        <div className="plugins-catalog-controls grid grid-cols-[minmax(520px,1fr)_minmax(460px,0.78fr)] items-stretch gap-2 max-[1180px]:grid-cols-1 [&>.compact-stat-strip]:min-w-0 [&>.compact-stat-strip]:rounded-[var(--radius-sm)] [&>.compact-stat-strip]:border [&>.compact-stat-strip]:border-[var(--border)] [&>.compact-stat-strip]:bg-[color-mix(in_srgb,var(--surface)_78%,transparent)]">
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
          <div className="filter-bar plugins-filter-bar grid min-w-0 grid-cols-[minmax(0,1fr)_clamp(176px,22vw,240px)] items-end gap-x-2.5 gap-y-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_78%,transparent)] px-2 py-1.5 max-[680px]:grid-cols-1">
            <label
              className="search-field plugins-filter-control plugins-filter-search grid min-w-0 grow gap-1"
              htmlFor="plugin-search"
            >
              <span className="plugins-filter-label font-[var(--font-mono)] text-[var(--text-meta)] tracking-[0.08em] text-[var(--muted)] uppercase">
                Search
              </span>
              <Input
                id="plugin-search"
                placeholder="Search plugins"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="plugins-filter-control plugins-filter-category grid min-w-0 gap-1">
              <span
                className="plugins-filter-label font-[var(--font-mono)] text-[var(--text-meta)] tracking-[0.08em] text-[var(--muted)] uppercase"
                id="plugin-category-label"
              >
                Category
              </span>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger
                  aria-labelledby="plugin-category-label"
                  className="plugins-category-trigger w-full min-w-0"
                >
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
        </div>
      ) : null}
      {active ? (
        resource.loading ? (
          <LoadingBlock label="Inspecting native plugin assembly…" />
        ) : resource.error ? (
          <ErrorBlock error={resource.error} retry={resource.reload} />
        ) : filtered.length ? (
          <PluginCatalogWorkspace
            entries={filtered}
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
