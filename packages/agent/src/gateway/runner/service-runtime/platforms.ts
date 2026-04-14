import { createPlatformAdapter } from "@/gateway/adapters/platform-adapter-factory";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import type { PlatformName } from "@/types/gateway";
import type {
  PlatformAdapter,
  PlatformLifecycleEvent,
} from "../../platforms/base";
import type { GatewayRunnerRuntimeState } from "./state";

export function createGatewayRunnerAdapter(
  context: GatewayRunnerContext,
  platform: PlatformName,
): PlatformAdapter {
  return createPlatformAdapter(platform, context);
}

export async function observeGatewayRunnerAdapter(
  state: GatewayRunnerRuntimeState,
  platform: PlatformName,
  event: PlatformLifecycleEvent,
): Promise<void> {
  const adapter = state.adapters.get(platform);
  if (!adapter?.observe) {
    return;
  }
  await adapter.observe(event);
}
