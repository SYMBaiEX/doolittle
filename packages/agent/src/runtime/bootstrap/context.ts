import { DOOLITTLE_SCHEDULER_SERVICE } from "@doolittle/contracts";
import type { AgentRuntime } from "@elizaos/core";
import { installNativeSlackInboundHandoff } from "@/gateway/platforms/native-slack-inbound";
import {
  finalizeCoreRuntimeServices,
  requireRuntimeService,
} from "@/runtime/bootstrap/runtime";
import { createDeferredHydrator } from "@/runtime/bootstrap/runtime/deferred-hydration";
import { createGatewayAccessor } from "@/runtime/bootstrap/runtime/gateway-factory";
import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";
import type {
  BootstrapContext,
  BootstrapContextParams,
} from "@/runtime/bootstrap/types";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import { getRuntimeToolProjection } from "@/runtime/native/service-bridge/service-resolution";
import type { AppServices } from "@/services";
import { createAcpProtocolHost } from "@/services/acp/host";

type RuntimeBindableServices = AppServices & {
  __bindRuntime?: (nextRuntime: AgentRuntime) => void;
};

export async function configureBootstrapContext({
  config,
  services,
  runtime,
  eagerDeferredHydration,
  startupMode,
  loadDeferredPlugins,
}: BootstrapContextParams): Promise<BootstrapContext> {
  appendBootstrapTrace("phase:finalizeCoreRuntimeServices:start");
  await finalizeCoreRuntimeServices(runtime);
  appendBootstrapTrace("phase:finalizeCoreRuntimeServices:done");
  services.nativeOwnership.attachRuntime(runtime, services);
  (services as RuntimeBindableServices).__bindRuntime?.(runtime);

  const schedulerService = requireRuntimeService<{
    startScheduler(): Promise<void>;
  }>(runtime, DOOLITTLE_SCHEDULER_SERVICE, ["startScheduler"]);
  const gateway = createGatewayAccessor({
    services,
    runtime,
  });
  const ensureDeferredHydration = createDeferredHydrator({
    services,
    loadDeferredPlugins,
    registerPlugin: async (plugin) => {
      await runtime.registerPlugin(plugin);
      getNativeServices(runtime).toolPolicy?.updatePluginGroups?.();
      installNativeSlackInboundHandoff(runtime, gateway.get());
    },
    ensureGateway: () => {
      gateway.get();
    },
    startScheduler: async () => {
      await schedulerService.startScheduler();
    },
    warmSupportServices: () => {
      services.diagnostics;
      services.operator;
      services.ecosystem;
      services.skills;
    },
  });

  services.startupState.markReady("runtime", "runtime ready");
  const context = {
    config,
    services,
    runtime,
    get gateway() {
      return gateway.get();
    },
    ensureDeferredHydration,
  } as BootstrapContext;
  services.acp.bindProtocolHost(createAcpProtocolHost(context));
  services.acp.bindRuntimeTools(() =>
    getRuntimeToolProjection(runtime).tools.filter((tool) => tool.enabled),
  );

  if (eagerDeferredHydration) {
    appendBootstrapTrace("phase:deferredHydration:start");
    await context.ensureDeferredHydration(startupMode);
    appendBootstrapTrace("phase:deferredHydration:done");
  }

  return context;
}
