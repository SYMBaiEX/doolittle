import { CompactStatStrip } from "../components/CompactStatStrip";
import { OfflineRouteState } from "../components/OfflineRouteState";
import {
  type ApiResource,
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  ErrorBlock,
  LoadingBlock,
  RawDataDisclosure,
} from "../lib";
import type { GatewayHealthResponse, GatewayRuntimeResponse } from "./models";
import {
  RUNTIME_CARD_CLASS,
  RUNTIME_CARD_HEADING_CLASS,
  RUNTIME_SECTION_STACK_CLASS,
  RUNTIME_STATUS_ROW_CLASS,
  RUNTIME_TWO_COLUMN_GRID_CLASS,
} from "./runtime-layout";

export function RuntimeGateway({
  active = true,
  gatewayHealth,
  gatewayRuntime,
}: {
  active?: boolean;
  gatewayHealth: ApiResource<GatewayHealthResponse>;
  gatewayRuntime: ApiResource<GatewayRuntimeResponse>;
}) {
  if (!active) {
    return (
      <OfflineRouteState>
        Gateway diagnostics are unavailable until the local runtime is ready.
      </OfflineRouteState>
    );
  }

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
    <div className={RUNTIME_SECTION_STACK_CLASS}>
      <CompactStatStrip
        label="Gateway runtime summary"
        stats={[
          {
            detail: `${asNumber(healthControl.configured, 0)} configured`,
            label: "Ready transports",
            tone: asNumber(healthControl.ready, 0) ? "good" : "warn",
            value: asNumber(healthControl.ready, 0),
          },
          { label: "Sessions", value: sessions.length },
          { label: "Deliveries", value: deliveries.length },
          {
            detail: `${messagingPlugins.length} messaging plugins`,
            label: "Inventory",
            value: inventory.length,
          },
        ]}
      />

      <div className={RUNTIME_TWO_COLUMN_GRID_CLASS}>
        <section className={RUNTIME_CARD_CLASS}>
          <div className={RUNTIME_CARD_HEADING_CLASS}>
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
              <div className={RUNTIME_STATUS_ROW_CLASS}>
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

        <section className={RUNTIME_CARD_CLASS}>
          <div className={RUNTIME_CARD_HEADING_CLASS}>
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
              <div className={RUNTIME_STATUS_ROW_CLASS}>
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
