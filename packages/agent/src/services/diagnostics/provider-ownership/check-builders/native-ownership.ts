import { summarizeTransportInventory } from "@/gateway/transport";
import type { DiagnosticCheck } from "@/types";
import type {
  GatewayTransportOverview,
  ProviderOwnershipContext,
} from "../types";

export function buildNativeOwnershipChecks(
  context: ProviderOwnershipContext,
  gatewayTransportOverview?: GatewayTransportOverview,
): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const { nativePlugins, ownership } = context;

  checks.push({
    id: "native.transport-mediation",
    status: nativePlugins.some((entry) => entry.category === "messaging")
      ? "pass"
      : "warn",
    summary: "Native messaging plugin mediation",
    detail: nativePlugins
      .filter((entry) => entry.category === "messaging")
      .map(
        (entry) =>
          `${entry.id}:${entry.enabled ? "enabled" : "disabled"}:${entry.source}`,
      )
      .join(", "),
  });

  if (!ownership) {
    return checks;
  }

  const controlPlane = ownership.transportControl;
  const pluginManager = ownership.pluginManager;
  const messagingBridge = controlPlane.messagingBridge ?? [];
  const totals = controlPlane.totals;
  const transportInventory = controlPlane.transportInventory ?? [];

  checks.push(
    {
      id: "native.messaging.services",
      status: messagingBridge.some((entry) => entry.live) ? "pass" : "warn",
      summary: "Native messaging runtime services",
      detail: messagingBridge
        .map(
          (entry) =>
            `${entry.platform}:available=${entry.serviceAvailable}:live=${entry.live}:plugin=${entry.pluginId ?? "n/a"}`,
        )
        .join(", "),
    },
    {
      id: "native.messaging.control-plane",
      status: totals.operationalTransports > 0 ? "pass" : "warn",
      summary: "Native messaging control plane",
      detail: `configured=${totals.configured} gatewayEnabled=${totals.gatewayEnabled} enabled=${totals.enabledPlugins} available=${totals.availableServices} live=${totals.liveServices} operational=${totals.operationalTransports} official=${totals.officialPlugins} vendored=${totals.vendoredPlugins} custom=${totals.customTransports} product=${totals.productTransports}`,
    },
    {
      id: "native.plugin-manager",
      status: pluginManager?.summary.total ? "pass" : "warn",
      summary: "Native plugin manager summary",
      detail: pluginManager
        ? `total=${pluginManager.summary.total} enabled=${pluginManager.summary.enabled} official=${pluginManager.summary.official} vendored=${pluginManager.summary.vendored} categories=${pluginManager.summary.categories}`
        : "Plugin manager inventory unavailable.",
    },
    {
      id: "gateway.transport.inventory",
      status: transportInventory.some((entry) => entry.operational)
        ? "pass"
        : "warn",
      summary: "Gateway transport inventory",
      detail: summarizeTransportInventory(transportInventory, "diagnostics"),
    },
    {
      id: "native.ownership.snapshot",
      status: ownership.serviceResolution.length > 0 ? "pass" : "warn",
      summary: "Native ownership control plane",
      detail: `serviceResolution=${ownership.serviceResolution.length} transportOperational=${totals.operationalTransports} pluginManagerEnabled=${pluginManager?.summary.enabled ?? 0}`,
    },
  );

  if (gatewayTransportOverview) {
    checks.push({
      id: "gateway.transport.overview",
      status: gatewayTransportOverview.mismatchCount > 0 ? "warn" : "pass",
      summary: "Gateway transport overview",
      detail: `operational=${gatewayTransportOverview.operationalCount} mismatches=${gatewayTransportOverview.mismatchCount}; ${gatewayTransportOverview.details
        .map(
          (entry) =>
            `${entry.platform}:${entry.mismatchFlags.length ? entry.mismatchFlags.join("|") : "ok"}`,
        )
        .join(", ")}`,
    });
  }

  return checks;
}
