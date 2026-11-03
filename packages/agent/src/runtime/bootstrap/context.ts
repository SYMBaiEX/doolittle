import { DOOLITTLE_SCHEDULER_SERVICE } from "@doolittle/contracts";
import { installNativeDiscordInboundHandoff } from "../../gateway/platforms/native-discord-inbound";
import { installNativeSignalInboundHandoff } from "../../gateway/platforms/native-signal-inbound";
import { installNativeSlackInboundHandoff } from "../../gateway/platforms/native-slack-inbound";
import { installNativeTelegramInboundHandoff } from "../../gateway/platforms/native-telegram-inbound";
import { installNativeWhatsAppInboundHandoff } from "../../gateway/platforms/native-whatsapp-inbound";
import { getRuntimeToolProjection } from "../native/service-bridge/service-resolution/index";
import { createDeferredHydrator } from "./runtime/deferred-hydration";
import { createGatewayAccessor } from "./runtime/gateway-factory";
import {
  finalizeCoreRuntimeServices,
  requireRuntimeService,
} from "./runtime/index";
import { appendBootstrapTrace } from "./trace";
import type { BootstrapContext, BootstrapContextParams } from "./types";

export async function configureBootstrapContext({
  config,
  services,
  runtime,
  loadDeferredPlugins,
  bindRuntime,
  workerBot,
}: BootstrapContextParams): Promise<BootstrapContext> {
  appendBootstrapTrace("phase:finalizeCoreRuntimeServices:start");
  await finalizeCoreRuntimeServices(runtime);
  appendBootstrapTrace("phase:finalizeCoreRuntimeServices:done");
  services.nativeOwnership.attachRuntime(runtime, services);

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

  const context: BootstrapContext = {
    config,
    services,
    runtime,
    get gateway() {
      return gateway.get();
    },
    ensureDeferredHydration,
  };
  // Rebind every runtime-aware service on each successful activation.
  bindRuntime(runtime);
  services.acp.bindRuntimeTools(() =>
    getRuntimeToolProjection(runtime).tools.filter((tool) => tool.enabled),
  );
  services.startupState.markReady("runtime", "runtime ready");
  return context;
}
