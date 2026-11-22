import {
  ChevronRight,
  LoaderCircle,
  Plug,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { CatalogFilterBar } from "./components/CatalogFilterBar";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { ResourceStatusBar } from "./components/ResourceStatusBar";
import { UiIcon } from "./components/UiIcon";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "./components/workbench/Workbench";
import {
  asArray,
  asNumber,
  asRecord,
  ErrorBlock,
  LoadingBlock,
  useApiResource,
} from "./lib";
import {
  filterToolEntries,
  toolEntryCategories,
} from "./tools/tool-catalog-filter";
import {
  TOOLS_INTEGRATIONS_BODY_CLASS,
  TOOLS_INTEGRATIONS_CLASS,
  TOOLS_INTEGRATIONS_LOADING_CLASS,
  TOOLS_INTEGRATIONS_LOADING_DETAIL_CLASS,
  TOOLS_INTEGRATIONS_LOADING_TITLE_CLASS,
} from "./tools/tools-layout";

interface ToolsResponse {
  tools?: unknown[];
  nativePluginManager?: unknown;
  runtimeOwned?: boolean;
  policyOwned?: boolean;
  effectiveProfile?: string;
  policyError?: string;
  summary?: Record<string, unknown>;
}

type McpControlPanelModule = typeof import("./components/McpControlPanel");
let mcpControlPanelModule: Promise<McpControlPanelModule> | null = null;

export function preloadMcpControlPanel(): Promise<McpControlPanelModule> {
  mcpControlPanelModule ??= import("./components/McpControlPanel");
  return mcpControlPanelModule;
}

const LazyMcpControlPanel = lazy(async () => ({
  default: (await preloadMcpControlPanel()).McpControlPanel,
}));

const LazyAcpBridgePanel = lazy(async () => ({
  default: (await import("./components/AcpBridgePanel")).AcpBridgePanel,
}));

const LazyToolCatalogWorkspace = lazy(async () => ({
  default: (await import("./tools/ToolCatalogWorkspace")).ToolCatalogWorkspace,
}));

export function McpControlPanelFallback() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={TOOLS_INTEGRATIONS_LOADING_CLASS}
      role="status"
    >
      <UiIcon
        className="animate-spin text-[var(--accent)] motion-reduce:animate-none"
        icon={LoaderCircle}
        size="md"
      />
      <div>
        <strong className={TOOLS_INTEGRATIONS_LOADING_TITLE_CLASS}>
          Loading MCP workspace…
        </strong>
        <small className={TOOLS_INTEGRATIONS_LOADING_DETAIL_CLASS}>
          Server and tool reads begin when the controls are ready.
        </small>
      </div>
    </div>
  );
}

export function ToolsPage({ active }: { active: boolean }) {
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const tools = useApiResource<ToolsResponse>(active ? "/tools" : null, [
    active,
  ]);
  const cachedCatalog = useRef<ToolsResponse | null>(null);
  useEffect(() => {
    if (tools.data) cachedCatalog.current = tools.data;
  }, [tools.data]);
  const catalogData = tools.data ?? cachedCatalog.current;
  const refresh = () => {
    if (active) tools.reload();
  };
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const entries = asArray(catalogData?.tools).map(asRecord);
  const categories = toolEntryCategories(entries);
  const filtered = filterToolEntries(entries, query, category);
  const totals = catalogData?.summary ?? {};

  const searching = Boolean(query.trim()) || category !== "all";
  return (
    <WorkbenchSection
      actions={
        <WorkbenchAction
          disabled={!active}
          emphasis="quiet"
          icon={RefreshCw}
          onClick={refresh}
        >
          Refresh
        </WorkbenchAction>
      }
      className="catalog-page"
      description="Find tools the agent can run and check the rules that apply to them."
      icon={Wrench}
      title="Tool registry"
    >
      {active ? (
        <>
          <div className="catalog-overview">
            <CompactStatStrip
              label="Tool catalog summary"
              stats={[
                {
                  label: "Registered",
                  value: asNumber(totals.total, entries.length),
                },
                {
                  label: "Enabled",
                  value: asNumber(totals.enabled),
                  tone: "good",
                },
                {
                  label: "Categories",
                  value: asArray(totals.categories).length,
                },
                {
                  label: "Permissions",
                  value: "Per request",
                  detail: "Checked when each action runs",
                },
              ]}
            />
            <ResourceStatusBar
              resources={[{ label: "Tool catalog", resource: tools }]}
            />
          </div>
          <details
            className={TOOLS_INTEGRATIONS_CLASS}
            onToggle={(event) => setIntegrationsOpen(event.currentTarget.open)}
            open={integrationsOpen}
          >
            <summary>
              <UiIcon icon={Plug} size="md" />
              <span>
                <strong>Integration bridges</strong>
                <small>MCP and ACP diagnostics</small>
              </span>
              <UiIcon
                className="tools-integrations__disclosure"
                icon={ChevronRight}
              />
            </summary>
            {integrationsOpen ? (
              <div className={TOOLS_INTEGRATIONS_BODY_CLASS}>
                <Suspense fallback={<McpControlPanelFallback />}>
                  <LazyMcpControlPanel active={active} />
                </Suspense>
                <Suspense
                  fallback={<LoadingBlock label="Loading ACP bridge…" />}
                >
                  <LazyAcpBridgePanel active={active} />
                </Suspense>
              </div>
            ) : null}
          </details>
          <CatalogFilterBar
            category={{
              label: "Tool category",
              onChange: setCategory,
              options: categories,
              value: category,
            }}
            onQueryChange={setQuery}
            placeholder="Search tools"
            query={query}
            resultLabel={
              tools.loading
                ? "Loading…"
                : tools.error
                  ? "Unavailable"
                  : `${filtered.length} of ${entries.length}`
            }
            searchLabel="Search tools"
          />
          {tools.loading && !catalogData ? (
            <LoadingBlock label="Reading tool registry…" />
          ) : tools.error && !catalogData ? (
            <ErrorBlock error={tools.error} retry={tools.reload} />
          ) : filtered.length ? (
            <Suspense fallback={<LoadingBlock label="Opening tool index…" />}>
              <LazyToolCatalogWorkspace
                entries={filtered}
                resetKey={`${category}:${query.trim().toLowerCase()}`}
              />
            </Suspense>
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
              icon={Wrench}
              title={searching ? "No tools match" : "No tools reported"}
            >
              {searching
                ? "Change the search or category filter."
                : "The runtime has not reported available tools."}
            </WorkbenchEmpty>
          )}
        </>
      ) : (
        <OfflineRouteState>
          Tool inventory and integration bridges are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      )}
    </WorkbenchSection>
  );
}
