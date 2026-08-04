import type {
  AccountPoolResponse,
  PluginsResponse,
  RuntimeStatus,
} from "../shared/contracts";
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
  RawDataDisclosure,
  titleCase,
  type UnknownRecord,
  useApiResource,
} from "./lib";

interface GatewayHealthResponse {
  summary?: UnknownRecord;
  transportControl?: UnknownRecord;
  sessions?: unknown[];
  deliveries?: unknown[];
  traces?: unknown[];
}

interface GatewayRuntimeResponse {
  summary?: UnknownRecord;
  runtime?: UnknownRecord;
  transportControl?: UnknownRecord;
  transportInventory?: unknown[];
  messagingPlugins?: unknown[];
}

export function RuntimePage({
  active,
  onOpenProviders,
}: {
  active: boolean;
  onOpenProviders?: () => void;
}) {
  const runtime = useApiResource<RuntimeStatus>(
    active ? "/runtime/status" : null,
    [active],
  );
  const plugins = useApiResource<PluginsResponse>(
    active ? "/runtime/plugins" : null,
    [active],
  );
  const ecosystem = useApiResource<UnknownRecord>(
    active ? "/runtime/ecosystem" : null,
    [active],
  );
  const insights = useApiResource<UnknownRecord>(active ? "/insights" : null, [
    active,
  ]);
  const gatewayHealth = useApiResource<GatewayHealthResponse>(
    active ? "/gateway/health" : null,
    [active],
  );
  const gatewayRuntime = useApiResource<GatewayRuntimeResponse>(
    active ? "/gateway/runtime" : null,
    [active],
  );
  const accountPool = useApiResource<AccountPoolResponse>(
    active ? "/runtime/account-pool" : null,
    [active],
  );
  const pooledAccounts = Object.values(
    accountPool.data?.providers ?? {},
  ).flatMap((provider) => provider.accounts);

  const catalog = asArray(plugins.data?.catalog).map(asRecord);
  const ecosystemPayload = asRecord(ecosystem.data);
  const insightPayload = asRecord(insights.data);
  const ownershipPayload = asRecord(insightPayload.ownership);
  const gatewayHealthSummary = asRecord(gatewayHealth.data?.summary);
  const gatewayRuntimeSummary = asRecord(gatewayRuntime.data?.summary);
  const gatewayTransportControl = asRecord(
    gatewayHealth.data?.transportControl,
  );
  const gatewayRuntimeControl = asRecord(gatewayRuntime.data?.transportControl);
  const gatewaySessions = asArray(gatewayHealth.data?.sessions);
  const gatewayDeliveries = asArray(gatewayHealth.data?.deliveries);
  const gatewayTraces = asArray(gatewayHealth.data?.traces);
  const gatewayInventory = asArray(gatewayRuntime.data?.transportInventory);
  const gatewayPlugins = asArray(gatewayRuntime.data?.messagingPlugins);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Runtime"
        title="Runtime"
        description="Inspect assembled runtime details, plugin inventory, ecosystem state, and operator insights."
        actions={
          <button
            className="text-button"
            onClick={() => {
              runtime.reload();
              plugins.reload();
              ecosystem.reload();
              insights.reload();
              gatewayHealth.reload();
              gatewayRuntime.reload();
              accountPool.reload();
            }}
            type="button"
          >
            Refresh
          </button>
        }
      />
      {runtime.loading ? (
        <LoadingBlock />
      ) : runtime.error ? (
        <ErrorBlock error={runtime.error} retry={runtime.reload} />
      ) : (
        <>
          <div className="metric-grid compact">
            <MetricCard
              label="Spawned-agent accounts"
              value={pooledAccounts.filter((account) => account.enabled).length}
              detail="Codex and Claude build/research sessions"
            />
            <MetricCard
              label="Provider"
              value={asString(runtime.data?.provider, "Not set")}
            />
            <MetricCard
              label="Model"
              value={asString(runtime.data?.model, "Unknown")}
            />
            <MetricCard label="Plugins" value={catalog.length} />
            <MetricCard
              label="Ownership signals"
              value={Object.keys(ownershipPayload).length}
              detail={
                runtime.data?.fallback?.offlineBootstrapMode
                  ? "offline bootstrap enabled"
                  : "offline bootstrap disabled"
              }
            />
          </div>
          <div className="two-column-grid">
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Spawned agents</span>
                  <h2>Account routing</h2>
                </div>
                <button
                  className="text-button"
                  disabled={!onOpenProviders}
                  onClick={onOpenProviders}
                  type="button"
                >
                  Providers &amp; accounts
                </button>
              </div>
              {accountPool.loading ? (
                <LoadingBlock />
              ) : accountPool.error ? (
                <ErrorBlock
                  error={accountPool.error}
                  retry={accountPool.reload}
                />
              ) : (
                <div className="status-row">
                  <div>
                    <strong>
                      {
                        pooledAccounts.filter((account) => account.enabled)
                          .length
                      }{" "}
                      enabled account(s)
                    </strong>
                    <small>
                      Pool strategy applies to spawned build and research
                      sessions, not this runtime's default conversation model.
                    </small>
                  </div>
                  <Badge
                    tone={
                      pooledAccounts.some((account) => account.enabled)
                        ? "good"
                        : "warn"
                    }
                  >
                    {pooledAccounts.some((account) => account.enabled)
                      ? "Ready"
                      : "Connect"}
                  </Badge>
                </div>
              )}
            </section>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Binding</span>
                  <h2>Active provider model</h2>
                </div>
                <Badge>{asString(runtime.data?.provider, "Not set")}</Badge>
              </div>
              <div className="status-row">
                <div>
                  <strong>
                    {asString(runtime.data?.model, "Unknown model")}
                  </strong>
                  <small>
                    {runtime.data?.fallback?.offlineBootstrapMode
                      ? "Offline bootstrap: enabled"
                      : "Offline bootstrap: disabled"}
                  </small>
                </div>
                <Badge tone="good">Running</Badge>
              </div>
              <RawDataDisclosure
                label="Startup receipt"
                value={runtime.data?.startup}
              />
            </section>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Plugins</span>
                  <h2>Catalog summary</h2>
                </div>
                <Badge>{catalog.length}</Badge>
              </div>
              {plugins.loading ? (
                <LoadingBlock />
              ) : plugins.error ? (
                <ErrorBlock error={plugins.error} retry={plugins.reload} />
              ) : catalog.length ? (
                <div className="stack-list">
                  {catalog.slice(0, 20).map((entry, index) => (
                    <article className="status-row" key={String(index)}>
                      <div>
                        <strong>
                          {asString(entry.name, asString(entry.id, "Plugin"))}
                        </strong>
                        <small>{asString(entry.id, "No id")}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyBlock title="No plugin entries">
                  Runtime is available but has no catalog payload.
                </EmptyBlock>
              )}
            </section>
          </div>
          <div className="two-column-grid" style={{ marginTop: "16px" }}>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Gateway</span>
                  <h2>Transport health</h2>
                </div>
                <Badge>
                  {asNumber(gatewayTransportControl.ready, 0)}/
                  {asNumber(gatewayTransportControl.configured, 0)} ready
                </Badge>
              </div>
              {gatewayHealth.loading ? (
                <LoadingBlock />
              ) : gatewayHealth.error ? (
                <ErrorBlock
                  error={gatewayHealth.error}
                  retry={gatewayHealth.reload}
                />
              ) : (
                <>
                  <div className="card-grid">
                    <MetricCard
                      label="Sessions"
                      value={gatewaySessions.length}
                    />
                    <MetricCard
                      label="Deliveries"
                      value={gatewayDeliveries.length}
                    />
                    <MetricCard label="Traces" value={gatewayTraces.length} />
                    <MetricCard
                      label="Live services"
                      value={asNumber(gatewayTransportControl.liveServices, 0)}
                    />
                  </div>
                  <div className="stack-list">
                    <div className="status-row">
                      <div>
                        <strong>
                          {asString(
                            gatewayHealthSummary.headline,
                            "Gateway health unavailable",
                          )}
                        </strong>
                        <small>
                          {asString(
                            gatewayHealthSummary.detail,
                            "No gateway health detail was returned.",
                          )}
                        </small>
                      </div>
                    </div>
                  </div>
                  <RawDataDisclosure
                    label="Gateway health payload"
                    value={gatewayHealth.data}
                  />
                </>
              )}
            </section>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Gateway</span>
                  <h2>Runtime attachment</h2>
                </div>
                <Badge>{gatewayInventory.length} transports</Badge>
              </div>
              {gatewayRuntime.loading ? (
                <LoadingBlock />
              ) : gatewayRuntime.error ? (
                <ErrorBlock
                  error={gatewayRuntime.error}
                  retry={gatewayRuntime.reload}
                />
              ) : (
                <>
                  <div className="card-grid">
                    <MetricCard
                      label="Configured"
                      value={asNumber(gatewayRuntimeControl.configured, 0)}
                    />
                    <MetricCard
                      label="Live services"
                      value={asNumber(gatewayRuntimeControl.liveServices, 0)}
                    />
                    <MetricCard
                      label="Messaging plugins"
                      value={gatewayPlugins.length}
                    />
                    <MetricCard
                      label="Inventory"
                      value={gatewayInventory.length}
                    />
                  </div>
                  <div className="stack-list">
                    <div className="status-row">
                      <div>
                        <strong>
                          {asString(
                            gatewayRuntimeSummary.headline,
                            "Gateway runtime unavailable",
                          )}
                        </strong>
                        <small>
                          {asString(
                            gatewayRuntimeSummary.detail,
                            "No runtime gateway detail was returned.",
                          )}
                        </small>
                      </div>
                    </div>
                  </div>
                  <RawDataDisclosure
                    label="Gateway runtime payload"
                    value={gatewayRuntime.data}
                  />
                </>
              )}
            </section>
          </div>
          <div className="two-column-grid" style={{ marginTop: "16px" }}>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Ecosystem</span>
                  <h2>Runtime ecosystem snapshot</h2>
                </div>
                <Badge>{Object.keys(ecosystemPayload).length}</Badge>
              </div>
              {ecosystem.loading ? (
                <LoadingBlock />
              ) : ecosystem.error ? (
                <ErrorBlock error={ecosystem.error} retry={ecosystem.reload} />
              ) : (
                <>
                  <div className="stack-list">
                    {Object.entries(ecosystemPayload)
                      .slice(0, 8)
                      .map(([key, value]) => (
                        <div className="status-row" key={key}>
                          <div>
                            <strong>{titleCase(key)}</strong>
                            <small>
                              {Array.isArray(value)
                                ? `${value.length} entries`
                                : typeof value === "object" && value
                                  ? `${Object.keys(asRecord(value)).length} fields`
                                  : String(value)}
                            </small>
                          </div>
                        </div>
                      ))}
                  </div>
                  <RawDataDisclosure
                    label="ElizaOS ecosystem payload"
                    value={ecosystem.data}
                  />
                </>
              )}
            </section>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Operator</span>
                  <h2>Insight snapshot</h2>
                </div>
                <Badge>{Object.keys(insightPayload).length}</Badge>
              </div>
              {insights.loading ? (
                <LoadingBlock />
              ) : insights.error ? (
                <ErrorBlock error={insights.error} retry={insights.reload} />
              ) : (
                <>
                  <div className="stack-list">
                    {Object.entries(ownershipPayload)
                      .slice(0, 8)
                      .map(([key, value]) => (
                        <div className="status-row" key={key}>
                          <div>
                            <strong>{titleCase(key)}</strong>
                            <small>
                              {typeof value === "object" && value
                                ? `${Object.keys(asRecord(value)).length} fields`
                                : String(value)}
                            </small>
                          </div>
                        </div>
                      ))}
                  </div>
                  <RawDataDisclosure
                    label="Runtime insights payload"
                    value={insights.data}
                  />
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
