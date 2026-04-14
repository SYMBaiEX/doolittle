import type { TransportInventory } from "./types";

function findInventoryEntry(
  inventory: TransportInventory | undefined,
  id: string,
): TransportInventory[number] | undefined {
  return inventory?.find((entry) => entry.platform === id);
}

export function describeTransportSummary(
  id: string,
  label: string,
  inventory?: TransportInventory,
  fallbackReady?: boolean,
  fallbackDetail?: string,
): { id: string; ready: boolean; detail: string } {
  const entry = findInventoryEntry(inventory, id);
  if (entry) {
    return {
      id,
      ready: entry.operational,
      detail: `${label}: source=${entry.source} cfg=${entry.configEnabled ? "on" : "off"} gateway=${entry.gatewayEnabled ? "on" : "off"} operational=${entry.operational ? "yes" : "no"} reason=${entry.reason}`,
    };
  }
  return {
    id,
    ready: fallbackReady ?? false,
    detail: fallbackDetail ?? `${label} transport is not available.`,
  };
}
