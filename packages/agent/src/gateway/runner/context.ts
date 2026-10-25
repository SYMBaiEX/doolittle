import type { AppContext } from "../../runtime/bootstrap/index";
import type { PlatformName } from "../../types/gateway";
import type { GatewayRuntimeStatus } from "../read/read-model/index";
import type { GatewayTransportDetail } from "../state/state-snapshot/index";

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
