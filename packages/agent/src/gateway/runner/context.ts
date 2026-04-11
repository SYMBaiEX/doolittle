import type { GatewayRuntimeStatus } from "@/gateway/read/read-model";
import type { GatewayTransportDetail } from "@/gateway/state/state-snapshot";
import type { AppContext } from "@/runtime/bootstrap";
import type { PlatformName } from "@/types/gateway";

export interface GatewayRunnerSurface {
  runtimeStatus(): GatewayRuntimeStatus;
  transport(platform: PlatformName): Promise<GatewayTransportDetail>;
}

export interface GatewayRunnerContext {
  config: AppContext["config"];
  services: AppContext["services"];
  runtime: AppContext["runtime"];
  gateway?: GatewayRunnerSurface;
  ensureDeferredHydration?: (reason?: string) => Promise<void>;
}
