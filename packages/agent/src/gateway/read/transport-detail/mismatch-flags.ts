import type { PlatformHealth } from "@/gateway/platforms/base";
import type { PlatformName } from "@/types/gateway";
import type {
  GatewayControlPlaneView,
  GatewayPlatformStateView,
} from "../../state/state-snapshot";

export interface TransportMismatchContext {
  platform: PlatformName;
  controlPlane: GatewayControlPlaneView;
  platformState: GatewayPlatformStateView;
  readiness?: PlatformHealth;
  includeHealthMismatch?: boolean;
}

export function collectTransportMismatchFlags(
  context: TransportMismatchContext,
): string[] {
  const mismatchFlags: string[] = [];
  const inventory = context.controlPlane.transportInventory.find(
    (entry) => entry.platform === context.platform,
  );
  const messagingBridge = context.controlPlane.messagingBridge.find(
    (entry) => entry.platform === context.platform,
  );

  if (inventory?.gatewayEnabled && !context.platformState.ready) {
    mismatchFlags.push("gateway-enabled-without-ready-platform");
  }
  if (inventory && inventory.operational !== context.platformState.ready) {
    mismatchFlags.push("inventory-operational-mismatch");
  }
  if (messagingBridge?.pluginEnabled && !messagingBridge.serviceAvailable) {
    mismatchFlags.push("plugin-enabled-without-runtime-service");
  }
  if (messagingBridge?.serviceAvailable && !messagingBridge.live) {
    mismatchFlags.push("runtime-service-not-live");
  }
  if (
    context.includeHealthMismatch &&
    context.readiness &&
    context.readiness.ready !== context.platformState.ready
  ) {
    mismatchFlags.push("health-ready-mismatch");
  }

  return mismatchFlags;
}
