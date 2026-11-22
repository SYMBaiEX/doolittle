import { Cable, Radio } from "lucide-react";
import { CompactStatStrip } from "../components/CompactStatStrip";
import { OfflineRouteState } from "../components/OfflineRouteState";
import { WorkbenchSection } from "../components/workbench/Workbench";
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
import { DiagnosticStatusRow } from "../runtime-state/DiagnosticWorkspace";
import type { GatewayHealthResponse, GatewayRuntimeResponse } from "./models";

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
    <div className="grid min-h-0 gap-3">
      <div className="diagnostic-workspace__stats">
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
      </div>
      <div className="diagnostic-workspace__grid">
        <WorkbenchSection
          actions={
            <Badge>
              {asNumber(healthControl.ready, 0)}/
              {asNumber(healthControl.configured, 0)} ready
            </Badge>
          }
          headingLevel={3}
          icon={Radio}
          title="Transport control"
        >
          {gatewayHealth.loading ? (
            <LoadingBlock label="Loading gateway health…" />
          ) : gatewayHealth.error ? (
            <ErrorBlock
              error={gatewayHealth.error}
              retry={gatewayHealth.reload}
            />
          ) : (
            <>
              <DiagnosticStatusRow
                title={asString(
                  healthSummary.headline,
                  "Gateway health available",
                )}
                detail={asString(
                  healthSummary.detail,
                  `${traces.length} trace receipts recorded.`,
                )}
                status={
                  <Badge
                    tone={asNumber(healthControl.ready, 0) ? "good" : "warn"}
                  >
                    {asNumber(healthControl.liveServices, 0)} live
                  </Badge>
                }
              />
              <RawDataDisclosure
                label="Gateway health payload"
                value={gatewayHealth.data}
              />
            </>
          )}
        </WorkbenchSection>

        <WorkbenchSection
          actions={<Badge>{inventory.length} transports</Badge>}
          headingLevel={3}
          icon={Cable}
          title="Messaging inventory"
        >
          {gatewayRuntime.loading ? (
            <LoadingBlock label="Loading gateway runtime…" />
          ) : gatewayRuntime.error ? (
            <ErrorBlock
              error={gatewayRuntime.error}
              retry={gatewayRuntime.reload}
            />
          ) : (
            <>
              <DiagnosticStatusRow
                title={asString(runtimeSummary.headline, "Runtime attached")}
                detail={asString(
                  runtimeSummary.detail,
                  `${messagingPlugins.length} messaging plugins registered.`,
                )}
                status={
                  <Badge
                    tone={
                      asNumber(runtimeControl.liveServices, 0)
                        ? "good"
                        : "neutral"
                    }
                  >
                    {asNumber(runtimeControl.liveServices, 0)} live
                  </Badge>
                }
              />
              <RawDataDisclosure
                label="Gateway runtime payload"
                value={gatewayRuntime.data}
              />
            </>
          )}
        </WorkbenchSection>
      </div>
    </div>
  );
}
