import {
  type ApiResource,
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  RawDataDisclosure,
} from "../lib";
import type { GatewayHealthResponse, GatewayRuntimeResponse } from "./models";

export function RuntimeGateway({
  gatewayHealth,
  gatewayRuntime,
}: {
  gatewayHealth: ApiResource<GatewayHealthResponse>;
  gatewayRuntime: ApiResource<GatewayRuntimeResponse>;
}) {
  const healthSummary = asRecord(gatewayHealth.data?.summary);
  const runtimeSummary = asRecord(gatewayRuntime.data?.summary);
  const healthControl = asRecord(gatewayHealth.data?.transportControl);
  const runtimeControl = asRecord(gatewayRuntime.data?.transportControl);
  const sessions = asArray(gatewayHealth.data?.sessions);
  const deliveries = asArray(gatewayHealth.data?.deliveries);
  const traces = asArray(gatewayHealth.data?.traces);
  const inventory = asArray(gatewayRuntime.data?.transportInventory);
  const messagingPlugins = asArray(gatewayRuntime.data?.messagingPlugins);

  return (
    <div className="runtime-section-stack">
      <div className="runtime-metrics">
        <MetricCard
          detail={`${asNumber(healthControl.configured, 0)} configured`}
          label="Ready transports"
          value={asNumber(healthControl.ready, 0)}
        />
        <MetricCard label="Sessions" value={sessions.length} />
        <MetricCard label="Deliveries" value={deliveries.length} />
        <MetricCard
          detail={`${messagingPlugins.length} messaging plugins`}
          label="Inventory"
          value={inventory.length}
        />
      </div>

      <div className="runtime-detail-grid">
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Gateway health</span>
              <h2>Transport control</h2>
            </div>
            <Badge>
              {asNumber(healthControl.ready, 0)}/
              {asNumber(healthControl.configured, 0)} ready
            </Badge>
          </div>
          {gatewayHealth.loading ? (
            <LoadingBlock label="Loading gateway health…" />
          ) : gatewayHealth.error ? (
            <ErrorBlock
              error={gatewayHealth.error}
              retry={gatewayHealth.reload}
            />
          ) : (
            <>
              <div className="status-row">
                <div>
                  <strong>
                    {asString(
                      healthSummary.headline,
                      "Gateway health available",
                    )}
                  </strong>
                  <small>
                    {asString(
                      healthSummary.detail,
                      `${traces.length} trace receipt(s) recorded.`,
                    )}
                  </small>
                </div>
                <Badge
                  tone={asNumber(healthControl.ready, 0) ? "good" : "warn"}
                >
                  {asNumber(healthControl.liveServices, 0)} live
                </Badge>
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
              <span className="eyebrow">Runtime attachment</span>
              <h2>Messaging inventory</h2>
            </div>
            <Badge>{inventory.length} transports</Badge>
          </div>
          {gatewayRuntime.loading ? (
            <LoadingBlock label="Loading gateway runtime…" />
          ) : gatewayRuntime.error ? (
            <ErrorBlock
              error={gatewayRuntime.error}
              retry={gatewayRuntime.reload}
            />
          ) : (
            <>
              <div className="status-row">
                <div>
                  <strong>
                    {asString(runtimeSummary.headline, "Runtime attached")}
                  </strong>
                  <small>
                    {asString(
                      runtimeSummary.detail,
                      `${messagingPlugins.length} messaging plugin(s) registered.`,
                    )}
                  </small>
                </div>
                <Badge
                  tone={
                    asNumber(runtimeControl.liveServices, 0)
                      ? "good"
                      : "neutral"
                  }
                >
                  {asNumber(runtimeControl.liveServices, 0)} live
                </Badge>
              </div>
              <RawDataDisclosure
                label="Gateway runtime payload"
                value={gatewayRuntime.data}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
