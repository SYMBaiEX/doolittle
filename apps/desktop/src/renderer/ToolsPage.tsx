import { useState } from "react";
import { AcpBridgePanel } from "./components/AcpBridgePanel";
import { McpControlPanel } from "./components/McpControlPanel";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
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
}

interface ToolsSummaryResponse {
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
  const summaryPath = active ? `/tools/summary?profile=${profile}` : null;
  const tools = useApiResource<ToolsResponse>(toolsPath, [active, profile]);
  const summary = useApiResource<ToolsSummaryResponse>(summaryPath, [
    active,
    profile,
  ]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
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
  const totals = summary.data?.summary ?? {};

  return (
    <div className="page">
      <PageHeader
        eyebrow="Agent"
        title="Tools"
        description="Search the capabilities available to this runtime."
        actions={
          <button
            className="secondary-button"
            onClick={tools.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      <div className="metric-grid compact">
        <MetricCard
          label="Registered"
          value={asNumber(totals.total, entries.length)}
        />
        <MetricCard label="Enabled" value={asNumber(totals.enabled)} />
        <MetricCard
          label="Categories"
          value={asArray(totals.categories).length}
        />
        <MetricCard
          label="Policy"
          value={
            tools.data?.policyOwned
              ? titleCase(tools.data.effectiveProfile ?? profile)
              : "Unverified"
          }
          detail={
            tools.data?.policyError
              ? tools.data.policyError
              : tools.data?.policyOwned
                ? `Eliza ToolPolicyService · ${asNumber(totals.pluginTools)} plugin tools`
                : "Registered actions only"
          }
        />
      </div>
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
        <div className="card-grid dense">
          {filtered.map((entry, index) => (
            <article
              className="content-card catalog-card"
              key={asString(entry.id, String(index))}
            >
              <div className="card-heading">
                <div>
                  <span className="eyebrow">
                    {titleCase(asString(entry.category, "uncategorized"))}
                  </span>
                  <h2>
                    {asString(entry.name, asString(entry.id, "Unnamed tool"))}
                  </h2>
                </div>
                <Badge tone={entry.enabled === false ? "warn" : "good"}>
                  {entry.enabled === false ? "Disabled" : "Enabled"}
                </Badge>
              </div>
              <p>{asString(entry.description, "No description provided.")}</p>
              <div className="card-footer">
                <code>{asString(entry.id)}</code>
                <span>
                  {entry.enabled === false && entry.policyReason
                    ? asString(entry.policyReason)
                    : asArray(entry.allowedProfiles).length
                      ? asArray(entry.allowedProfiles)
                          .map((value) => titleCase(asString(value)))
                          .join(" · ")
                      : titleCase(asString(entry.transport, "native"))}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyBlock title="No tools match">
          Change the search or category filter.
        </EmptyBlock>
      )}
    </div>
  );
}
