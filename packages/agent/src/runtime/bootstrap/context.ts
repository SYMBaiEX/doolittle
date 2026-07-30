import {
  DOOLITTLE_SCHEDULER_SERVICE,
  DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
} from "@doolittle/contracts";
import type { AgentRuntime } from "@elizaos/core";
import {
  attachRunProgressBridge,
  finalizeCoreRuntimeServices,
  installDynamicModelProviderRouting,
  installProviderFailureTemplates,
  patchRuntimeRelationshipCompatibility,
  requireRuntimeService,
} from "@/runtime/bootstrap/runtime";
import { createAutomationExecutor } from "@/runtime/bootstrap/runtime/automation-executor";
import { createDeferredHydrator } from "@/runtime/bootstrap/runtime/deferred-hydration";
import { createGatewayAccessor } from "@/runtime/bootstrap/runtime/gateway-factory";
import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";
import type {
  BootstrapContext,
  BootstrapContextParams,
} from "@/runtime/bootstrap/types";
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
  patchRuntimeRelationshipCompatibility(runtime);
  appendBootstrapTrace("phase:patchRelationshipsCompatibility:done");
  appendBootstrapTrace("phase:finalizeCoreRuntimeServices:start");
  await finalizeCoreRuntimeServices(runtime);
  appendBootstrapTrace("phase:finalizeCoreRuntimeServices:done");
  services.nativeOwnership.attachRuntime(runtime, services);
  (services as RuntimeBindableServices).__bindRuntime?.(runtime);
  installDynamicModelProviderRouting(
    runtime,
    () => services.settings.get().model.provider,
  );
  installProviderFailureTemplates(runtime, () => services.settings.get().model);
  attachRunProgressBridge(runtime, services);
  appendBootstrapTrace("phase:attachRunProgressBridge:done");

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
    registerPlugin: (plugin) => runtime.registerPlugin(plugin),
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
  const workflowDispatch = requireRuntimeService<{
    setExecutor(executor: ReturnType<typeof createAutomationExecutor>): void;
  }>(runtime, DOOLITTLE_WORKFLOW_DISPATCH_SERVICE, ["setExecutor"]);
  workflowDispatch.setExecutor(
    createAutomationExecutor({
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
  services.acp.bindProtocolHost(createAcpProtocolHost(context));

  if (eagerDeferredHydration) {
    appendBootstrapTrace("phase:deferredHydration:start");
    await context.ensureDeferredHydration(startupMode);
    appendBootstrapTrace("phase:deferredHydration:done");
  }

  return context;
}
