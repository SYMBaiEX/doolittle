import type { AgentRuntime } from "@elizaos/core";
import {
  attachRunProgressBridge,
  ensureCoreRuntimeServices,
  patchRuntimeRelationshipCompatibility,
} from "@/runtime/bootstrap/runtime";
import { createCronExecutor } from "@/runtime/bootstrap/runtime/cron-executor";
import { createDeferredHydrator } from "@/runtime/bootstrap/runtime/deferred-hydration";
import { createGatewayAccessor } from "@/runtime/bootstrap/runtime/gateway-factory";
import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";
import type {
  BootstrapContext,
  BootstrapContextParams,
} from "@/runtime/bootstrap/types";
import type { AppServices } from "@/services";

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
  patchRuntimeRelationshipCompatibility(runtime);
  appendBootstrapTrace("phase:patchRelationshipsCompatibility:done");
  appendBootstrapTrace("phase:ensureCoreRuntimeServices:start");
  await ensureCoreRuntimeServices(runtime);
  appendBootstrapTrace("phase:ensureCoreRuntimeServices:done");
  services.nativeOwnership.attachRuntime(runtime, services);
  (services as RuntimeBindableServices).__bindRuntime?.(runtime);
  attachRunProgressBridge(runtime, services);
  appendBootstrapTrace("phase:attachRunProgressBridge:done");

  const schedulerService = runtime.getService("doolittle_scheduler") as {
    startScheduler?: () => Promise<void>;
  } | null;
  const gateway = createGatewayAccessor({
    config,
    services,
    runtime,
  });
  const ensureDeferredHydration = createDeferredHydrator({
    services,
    loadDeferredPlugins,
    registerPlugin: (plugin) => runtime.registerPlugin(plugin),
    ensureGateway: () => {
      gateway.get();
    },
    startScheduler: async () => {
      if (schedulerService?.startScheduler) {
        await schedulerService.startScheduler();
        return;
      }
      services.cron.start();
    },
    warmSupportServices: () => {
      services.diagnostics;
      services.operator;
      services.ecosystem;
      services.skills;
    },
  });

  services.startupState.markReady("runtime", "runtime ready");
  services.cron.setExecutor(
    createCronExecutor({
      config,
      services,
      runtime,
      ensureGateway: () => gateway.get(),
    }),
  );

  const context = {
    config,
    services,
    runtime,
    get gateway() {
      return gateway.get();
    },
    ensureDeferredHydration,
  } as BootstrapContext;

  if (eagerDeferredHydration) {
    appendBootstrapTrace("phase:deferredHydration:start");
    await context.ensureDeferredHydration(startupMode);
    appendBootstrapTrace("phase:deferredHydration:done");
  }

  return context;
}
