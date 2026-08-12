import { useState } from "react";
import { AcpBridgePanel } from "./components/AcpBridgePanel";
import {
  CompactCatalogList,
  catalogExceptionStatus,
} from "./components/CompactCatalogList";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { McpControlPanel } from "./components/McpControlPanel";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  asArray,
  asNumber,
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

export function ToolsPage({ active }: { active: boolean }) {
  const [profile, setProfile] = useState<ToolProfile>("full");
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const toolsPath = active ? `/tools?profile=${profile}` : null;
  const tools = useApiResource<ToolsResponse>(toolsPath, [active, profile]);
  const refresh = () => {
    if (active) tools.reload();
  };
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  if (!active) {
    return (
      <div className="page">
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
          description="Search the capabilities available to this runtime."
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
  const entries = asArray(tools.data?.tools).map(asRecord);
  const categories = [
    "all",
    ...new Set(
      entries.map((entry) => asString(entry.category)).filter(Boolean),
    ),
  ];
  const filtered = entries.filter((entry) => {
    const matchesCategory =
      category === "all" || asString(entry.category) === category;
    const normalized = query.trim().toLowerCase();
    const matchesQuery =
      !normalized ||
      [entry.id, entry.name, entry.description, entry.category, entry.transport]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    return matchesCategory && matchesQuery;
  });
  const catalogEntries = filtered.map((entry, index) => {
    const id = asString(entry.id, `tool-${index}`);
    const profiles = asArray(entry.allowedProfiles)
      .map((value) => titleCase(asString(value)))
      .filter(Boolean)
      .join(" · ");
    return {
      id,
      eyebrow: titleCase(asString(entry.category, "uncategorized")),
      title: asString(entry.name, id || "Unnamed tool"),
      description: asString(entry.description, "No description provided."),
      ...catalogExceptionStatus(entry.enabled !== false, "Disabled"),
      code: id,
      meta: profiles || titleCase(asString(entry.transport, "native")),
      facts: [
        {
          label: "Transport",
          value: titleCase(asString(entry.transport, "native")),
        },
        {
          label: "Profiles",
          value: profiles || "Runtime default",
        },
        ...(entry.enabled === false && entry.policyReason
          ? [
              {
                label: "Policy",
                value: asString(entry.policyReason),
              },
            ]
          : []),
      ],
    };
  });
  const totals = tools.data?.summary ?? {};

  return (
    <div className="page">
      <PageHeader
        eyebrow="Agent"
        title="Tools"
        description="Search the capabilities available to this runtime."
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
            value: tools.data?.policyOwned
              ? titleCase(tools.data.effectiveProfile ?? profile)
              : "Unverified",
            detail: tools.data?.policyError
              ? tools.data.policyError
              : tools.data?.policyOwned
                ? `Eliza ToolPolicyService · ${asNumber(totals.pluginTools)} plugin tools`
                : "Registered actions only",
            tone: tools.data?.policyOwned ? "good" : "warn",
          },
        ]}
      />
      <details
        className="tools-integrations"
        onToggle={(event) => setIntegrationsOpen(event.currentTarget.open)}
      >
        <summary>
          <span>
            <strong>Integration bridges</strong>
            <small>MCP discovery and ACP diagnostics</small>
          </span>
          <span>{integrationsOpen ? "Hide" : "Inspect"}</span>
        </summary>
        {integrationsOpen ? (
          <div className="tools-integrations__body">
            <McpControlPanel active={active} />
            <AcpBridgePanel active={active} />
          </div>
        ) : null}
      </details>
      <div className="filter-bar">
        <label className="search-field">
          <span className="sr-only">Search tools</span>
          <input
            placeholder="Search tools"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
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
      </div>
      {tools.loading ? (
        <LoadingBlock label="Reading tool registry…" />
      ) : tools.error ? (
        <ErrorBlock error={tools.error} retry={tools.reload} />
      ) : filtered.length ? (
        <CompactCatalogList
          ariaLabel="Runtime tool catalog"
          entries={catalogEntries}
          resetKey={`${profile}:${category}:${query.trim().toLowerCase()}`}
        />
      ) : (
        <EmptyBlock title="No tools match">
          Change the search or category filter.
        </EmptyBlock>
      )}
    </div>
  );
}
