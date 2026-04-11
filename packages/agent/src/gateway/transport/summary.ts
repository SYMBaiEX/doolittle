import type { TransportInventoryEntry } from "./types";

export function summarizeTransportInventory(
  inventory: TransportInventoryEntry[],
  mode: "cli" | "chat" | "diagnostics" = "chat",
): string {
  const totals = {
    operational: inventory.filter((entry) => entry.operational).length,
    configEnabled: inventory.filter((entry) => entry.configEnabled).length,
    gatewayEnabled: inventory.filter((entry) => entry.gatewayEnabled).length,
    official: inventory.filter((entry) => entry.source === "official").length,
    vendored: inventory.filter((entry) => entry.source === "vendored").length,
    custom: inventory.filter((entry) => entry.source === "custom").length,
    product: inventory.filter((entry) => entry.source === "product").length,
  };

  if (mode === "diagnostics") {
    return [
      `operational=${totals.operational}/${inventory.length} configured=${totals.configEnabled} gatewayEnabled=${totals.gatewayEnabled}`,
      `official=${totals.official} vendored=${totals.vendored} custom=${totals.custom} product=${totals.product}`,
      ...inventory.map(
        (entry) =>
          `${entry.platform}:source=${entry.source}:cfg=${entry.configEnabled ? "on" : "off"}:gateway=${entry.gatewayEnabled ? "on" : "off"}:live=${entry.operational ? "yes" : "no"}:${entry.reason}`,
      ),
    ].join(", ");
  }

  if (mode === "cli") {
    return [
      `Inventory totals: operational=${totals.operational}/${inventory.length} config=${totals.configEnabled} gateway=${totals.gatewayEnabled}`,
      `Sources: official=${totals.official} vendored=${totals.vendored} custom=${totals.custom} product=${totals.product}`,
      ...inventory.map(
        (entry) =>
          `- ${entry.platform} ${entry.source} cfg=${entry.configEnabled ? "on" : "off"} gate=${entry.gatewayEnabled ? "on" : "off"} op=${entry.operational ? "yes" : "no"} ${entry.reason} :: ${entry.detail}`,
      ),
    ].join("\n");
  }

  return [
    `inventory totals: operational=${totals.operational}/${inventory.length} configEnabled=${totals.configEnabled} gatewayEnabled=${totals.gatewayEnabled}`,
    `sources: official=${totals.official} vendored=${totals.vendored} custom=${totals.custom} product=${totals.product}`,
    ...inventory.map(
      (entry) =>
        `- ${entry.platform} source=${entry.source} config=${entry.configEnabled} gateway=${entry.gatewayEnabled} op=${entry.operational} reason=${entry.reason} :: ${entry.detail}`,
    ),
  ].join("\n");
}
