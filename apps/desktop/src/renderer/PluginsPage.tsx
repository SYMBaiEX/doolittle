import { Puzzle, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { PluginsResponse } from "../shared/contracts";
import { CatalogFilterBar } from "./components/CatalogFilterBar";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "./components/workbench/Workbench";
import {
  asArray,
  asRecord,
  ErrorBlock,
  LoadingBlock,
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
  const normalized = query.trim().toLowerCase();
  const searching = Boolean(normalized) || category !== "all";
  const filtered = entries.filter(
    (entry) =>
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
          .includes(normalized)),
  );
  const enabled = entries.filter((entry) => entry.enabled).length;

  return (
    <WorkbenchSection
      actions={
        <WorkbenchAction
          disabled={!active}
          emphasis="quiet"
          icon={RefreshCw}
          onClick={resource.reload}
        >
          Refresh
        </WorkbenchAction>
      }
      className="catalog-page"
      description="See what ElizaOS has loaded, which plugins are inactive, and where each plugin comes from."
      icon={Puzzle}
      title="Plugin catalog"
    >
      {active ? (
        <>
          <div className="catalog-overview">
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
          </div>
          <CatalogFilterBar
            category={{
              label: "Category",
              onChange: setCategory,
              options: categories,
              value: category,
            }}
            onQueryChange={setQuery}
            placeholder="Search plugins"
            query={query}
            resultLabel={
              resource.loading
                ? "Loading…"
                : resource.error
                  ? "Unavailable"
                  : `${filtered.length} of ${entries.length}`
            }
            searchLabel="Search plugins"
          />
          {resource.loading ? (
            <LoadingBlock label="Inspecting native plugin assembly…" />
          ) : resource.error ? (
            <ErrorBlock error={resource.error} retry={resource.reload} />
          ) : filtered.length ? (
            <PluginCatalogWorkspace
              entries={filtered}
              resetKey={`${category}:${normalized}`}
            />
          ) : (
            <WorkbenchEmpty
              actions={
                searching ? (
                  <WorkbenchAction
                    emphasis="secondary"
                    onClick={() => {
                      setQuery("");
                      setCategory("all");
                    }}
                  >
                    Clear filters
                  </WorkbenchAction>
                ) : undefined
              }
              icon={Puzzle}
              title={searching ? "No plugins match" : "No plugins reported"}
            >
              {searching
                ? "Change the search or category filter."
                : "ElizaOS has not reported plugins for this runtime."}
            </WorkbenchEmpty>
          )}
        </>
      ) : (
        <OfflineRouteState>
          Plugin assembly is unavailable until the local runtime is ready.
        </OfflineRouteState>
      )}
    </WorkbenchSection>
  );
}
