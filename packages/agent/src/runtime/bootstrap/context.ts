import { DOOLITTLE_SCHEDULER_SERVICE } from "@doolittle/contracts";
import type { AgentRuntime } from "@elizaos/core";
import { installNativeDiscordInboundHandoff } from "../../gateway/platforms/native-discord-inbound";
import { installNativeSignalInboundHandoff } from "../../gateway/platforms/native-signal-inbound";
import { installNativeSlackInboundHandoff } from "../../gateway/platforms/native-slack-inbound";
import { installNativeTelegramInboundHandoff } from "../../gateway/platforms/native-telegram-inbound";
import { installNativeWhatsAppInboundHandoff } from "../../gateway/platforms/native-whatsapp-inbound";
import { createAcpProtocolHost } from "../../services/acp/host";
import type { AppServices } from "../../services/index";
import { getNativeServices } from "../native/service-bridge/runtime";
import { getRuntimeToolProjection } from "../native/service-bridge/service-resolution/index";
import { readWorkerBotProfile } from "./bot-profile";
import { createDeferredHydrator } from "./runtime/deferred-hydration";
import { createGatewayAccessor } from "./runtime/gateway-factory";
import {
  finalizeCoreRuntimeServices,
  requireRuntimeService,
} from "./runtime/index";
import { appendBootstrapTrace } from "./trace";
import type { BootstrapContext, BootstrapContextParams } from "./types";

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

  const workerBot = readWorkerBotProfile();

  const schedulerService = workerBot
    ? null
    : requireRuntimeService<{
        startScheduler(): Promise<void>;
      }>(runtime, DOOLITTLE_SCHEDULER_SERVICE, ["startScheduler"]);
  const gateway = createGatewayAccessor({
    services,
    runtime,
  });
  const hostDeferredHydration = createDeferredHydrator({
    services,
    loadDeferredPlugins,
    registerPlugin: async (plugin) => {
      await runtime.registerPlugin(plugin);
      getNativeServices(runtime).toolPolicy?.updatePluginGroups?.();
      installNativeDiscordInboundHandoff(runtime, gateway.get());
      installNativeSlackInboundHandoff(runtime, gateway.get());
      installNativeTelegramInboundHandoff(runtime, gateway.get());
      installNativeSignalInboundHandoff(runtime, gateway.get());
      installNativeWhatsAppInboundHandoff(runtime, gateway.get());
    },
    ensureGateway: () => {
      gateway.get();
    },
    startScheduler: async () => {
      await schedulerService?.startScheduler();
    },
    warmSupportServices: () => {
      services.diagnostics;
      services.operator;
      services.ecosystem;
      services.skills;
    },
  });
  const ensureDeferredHydration = workerBot
    ? async () => undefined
    : hostDeferredHydration;
  gateway.setDeferredHydration(ensureDeferredHydration);

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
