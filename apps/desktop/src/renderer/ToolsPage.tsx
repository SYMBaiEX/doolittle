import { LoaderCircle } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { CatalogFilterBar } from "./components/CatalogFilterBar";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { ResourceStatusBar } from "./components/ResourceStatusBar";
import { UiIcon } from "./components/UiIcon";
import {
  asArray,
  asNumber,
  asRecord,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  titleCase,
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

type ToolProfile = "minimal" | "coding" | "messaging" | "full";

const TOOL_PROFILES: readonly ToolProfile[] = [
  "minimal",
  "coding",
  "messaging",
  "full",
];

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
  const [profile, setProfile] = useState<ToolProfile>("full");
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const toolsPath = active ? `/tools?profile=${profile}` : null;
  const tools = useApiResource<ToolsResponse>(toolsPath, [active, profile]);
  const cachedCatalog = useRef<{
    profile: ToolProfile;
    data: ToolsResponse;
  } | null>(null);
  useEffect(() => {
    if (tools.data) cachedCatalog.current = { profile, data: tools.data };
  }, [profile, tools.data]);
  const catalogData =
    tools.data ??
    (cachedCatalog.current?.profile === profile
      ? cachedCatalog.current.data
      : null);
  const refresh = () => {
    if (active) tools.reload();
  };
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  if (!active) {
    return (
      <div className="page page-tools gap-3">
        <PageHeader
          actions={
            <button
              className="secondary-button"
              disabled
              onClick={refresh}
              type="button"
            >
              Refresh
            </button>
          }
          description="Search runtime capabilities and inspect integration bridges."
          eyebrow="Agent"
          title="Tools"
        />
        <OfflineRouteState>
          Tool inventory and integration bridges are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      </div>
    );
  }
  const entries = asArray(catalogData?.tools).map(asRecord);
  const categories = toolEntryCategories(entries);
  const filtered = filterToolEntries(entries, query, category);
  const totals = catalogData?.summary ?? {};

  return (
    <div className="page page-tools gap-3">
      <PageHeader
        eyebrow="Agent"
        title="Tools"
        description="Search runtime capabilities and inspect integration bridges."
        actions={
          <button
            className="secondary-button"
            disabled={!active}
            onClick={refresh}
            type="button"
          >
            Refresh
          </button>
        }
      />
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
          { label: "Categories", value: asArray(totals.categories).length },
          {
            label: "Policy",
            value: catalogData?.policyOwned
              ? titleCase(catalogData.effectiveProfile ?? profile)
              : "Unverified",
            detail: catalogData?.policyError
              ? catalogData.policyError
              : catalogData?.policyOwned
                ? `Eliza ToolPolicyService · ${asNumber(totals.pluginTools)} plugin tools`
                : "Registered actions only",
            tone: catalogData?.policyOwned ? "good" : "warn",
          },
        ]}
      />
      <ResourceStatusBar
        resources={[{ label: "Tool catalog", resource: tools }]}
      />
      <details
        className={TOOLS_INTEGRATIONS_CLASS}
        onToggle={(event) => setIntegrationsOpen(event.currentTarget.open)}
      >
        <summary>
          <span>
            <strong>Integration bridges</strong>
            <small>MCP + ACP diagnostics</small>
          </span>
          <span>{integrationsOpen ? "Hide" : "Inspect"}</span>
        </summary>
        {integrationsOpen ? (
          <div className={TOOLS_INTEGRATIONS_BODY_CLASS}>
            <Suspense fallback={<McpControlPanelFallback />}>
              <LazyMcpControlPanel active={active} />
            </Suspense>
            <Suspense fallback={<LoadingBlock label="Loading ACP bridge…" />}>
              <LazyAcpBridgePanel active={active} />
            </Suspense>
          </div>
        ) : null}
      </details>
      <CatalogFilterBar
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
      >
        <select
          aria-label="Tool category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((value) => (
            <option key={value} value={value}>
              {titleCase(value)}
            </option>
          ))}
        </select>
        <select
          aria-label="Eliza tool profile"
          value={profile}
          onChange={(event) => setProfile(event.target.value as ToolProfile)}
        >
          {TOOL_PROFILES.map((value) => (
            <option key={value} value={value}>
              {titleCase(value)} profile
            </option>
          ))}
        </select>
      </CatalogFilterBar>
      {tools.loading && !catalogData ? (
        <LoadingBlock label="Reading tool registry…" />
      ) : tools.error && !catalogData ? (
        <ErrorBlock error={tools.error} retry={tools.reload} />
      ) : filtered.length ? (
        <Suspense fallback={<LoadingBlock label="Opening tool index…" />}>
          <LazyToolCatalogWorkspace
            entries={filtered}
            resetKey={`${profile}:${category}:${query.trim().toLowerCase()}`}
          />
        </Suspense>
      ) : (
        <EmptyBlock density="compact" title="No tools match">
          Change the search or category filter.
        </EmptyBlock>
      )}
    </div>
  );
}
