import type { GatewayConfig } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import type { RuntimeLike } from "../runtime-contracts";
import { ALL_TRANSPORT_PLATFORMS } from "./constants";
import { buildEffectiveTransportInventoryEntry } from "./decision-helpers";
import { getEffectiveMessagingTransportInventory } from "./messaging";
import type {
  EffectiveMessagingTransportEntry,
  EffectiveTransportInventoryEntry,
} from "./types";

export function getEffectiveTransportInventory(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
): EffectiveTransportInventoryEntry[] {
  const messagingBridge = getEffectiveMessagingTransportInventory(
    runtime,
    config,
    gatewayConfig,
  );
  const messagingMap = new Map<
    EffectiveTransportInventoryEntry["platform"],
    EffectiveMessagingTransportEntry
  >(messagingBridge.map((entry) => [entry.platform, entry]));

  return ALL_TRANSPORT_PLATFORMS.map((platform) =>
    buildEffectiveTransportInventoryEntry(
      platform,
      config,
      gatewayConfig,
      messagingMap.get(platform),
    ),
  );
}
