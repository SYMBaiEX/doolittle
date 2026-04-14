import type { GatewayConfig } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import type { RuntimeLike } from "../runtime-contracts";
import { getEffectiveMessagingTransportInventoryEntries } from "./decision-helpers";
import type {
  EffectiveMessagingTransportEntry,
  NativeMessagingTransportState,
} from "./types";

function summarizeNativeMessagingTransportState(
  platform: EffectiveMessagingTransportEntry["platform"],
  entry: EffectiveMessagingTransportEntry,
  ready: boolean,
): string {
  return [
    `${platform}:`,
    `config=${entry.configEnabled}`,
    `gateway=${entry.gatewayEnabled}`,
    `plugin=${entry.pluginEnabled}`,
    `service=${entry.serviceAvailable}`,
    `live=${entry.live}`,
    `ready=${ready}`,
    `reason=${entry.reason}`,
  ].join(" ");
}

export function getEffectiveMessagingTransportInventory(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig?: GatewayConfig,
): EffectiveMessagingTransportEntry[] {
  return getEffectiveMessagingTransportInventoryEntries(
    runtime,
    config,
    gatewayConfig,
  );
}

export function getNativeMessagingTransportState(
  runtime: RuntimeLike,
  config: EnvConfig,
  gatewayConfig: GatewayConfig | undefined,
  platform: EffectiveMessagingTransportEntry["platform"],
): NativeMessagingTransportState | undefined {
  const entry = getEffectiveMessagingTransportInventory(
    runtime,
    config,
    gatewayConfig,
  ).find((transport) => transport.platform === platform);
  if (!entry) {
    return undefined;
  }

  const ready = entry.live && entry.gatewayEnabled;
  return {
    ...entry,
    ready,
    summary: summarizeNativeMessagingTransportState(platform, entry, ready),
  };
}
