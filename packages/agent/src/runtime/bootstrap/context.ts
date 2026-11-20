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
  loadTurnPlugins,
  loadMessagingPlugins,
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
  const { ensureTurnPlugins, ensureDeferredHydration } = workerBot
    ? {
        ensureTurnPlugins: async () => undefined,
        ensureDeferredHydration: async () => undefined,
      }
    : createDeferredHydrator({
        services,
        loadTurnPlugins,
        loadMessagingPlugins,
        registerTurnPlugin: (plugin) => runtime.registerPlugin(plugin),
        ensureGateway: () => {
          gateway.get();
        },
        registerMessagingPlugin: async (plugin) => {
          if (!runtime.plugins.includes(plugin)) {
            await runtime.registerPlugin(plugin);
          }
          if (
            plugin.services?.some(
              (service) => service.serviceType === plugin.name,
            )
          ) {
            // SDK registration starts services asynchronously. Install our
            // inbound policy as soon as this configured connector is available.
            await runtime.getServiceLoadPromise(plugin.name);
          }
          const runner = gateway.get();
          installNativeDiscordInboundHandoff(runtime, runner);
          installNativeSlackInboundHandoff(runtime, runner);
          installNativeTelegramInboundHandoff(runtime, runner);
          installNativeSignalInboundHandoff(runtime, runner);
          installNativeWhatsAppInboundHandoff(runtime, runner);
        },
        startScheduler: async () => {
          await schedulerService?.startScheduler();
        },
      });
  gateway.setTurnPluginReadiness(ensureTurnPlugins);

  const context: BootstrapContext = {
    config,
    services,
    runtime,
    get gateway() {
      return gateway.get();
    },
    ensureTurnPlugins,
    ensureDeferredHydration,
  };
  // Rebind every runtime-aware service on each successful activation.
  bindRuntime(runtime);
  services.acp.bindRuntimeTools(() =>
    getRuntimeToolProjection(runtime).tools.filter((tool) => tool.enabled),
  );
  if (workerBot) {
    services.startupState.markReady("tools", "worker tools ready");
  }
  services.startupState.markReady("runtime", "runtime ready");
  return context;
}
