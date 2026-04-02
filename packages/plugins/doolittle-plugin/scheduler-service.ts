import type { AppServices } from "@doolittle/agent/plugin-api";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Service,
  type ServiceClass,
} from "@elizaos/core";

export function createSchedulerRuntimeService(
  services: AppServices,
): ServiceClass {
  class SchedulerRuntimeService extends ElizaService {
    static serviceType = "doolittle_scheduler";

    capabilityDescription =
      "Runs recurring automations and session maintenance for Doolittle.";

    #intervalId: ReturnType<typeof setInterval> | null = null;
    #started = false;

    // biome-ignore lint/complexity/noUselessConstructor: ElizaOS ServiceClass expects an optional runtime constructor.
    constructor(runtime?: IAgentRuntime) {
      super(runtime);
    }

    static async start(runtime: IAgentRuntime): Promise<Service> {
      return new SchedulerRuntimeService(runtime);
    }

    async startScheduler(): Promise<void> {
      if (this.#started) {
        return;
      }
      this.#started = true;
      services.cron.start();
      this.#intervalId = setInterval(async () => {
        const settings = services.settings.get();
        const expired = services.gatewaySessions.expireOlderThan(
          settings.gateway.sessionTimeoutMinutes,
        );
        if (expired.length > 0) {
          await services.hooks.emit("session:expired", {
            count: expired.length,
          });
        }
      }, 60_000);
      this.#intervalId.unref?.();
    }

    async stop(): Promise<void> {
      this.#started = false;
      services.cron.stop();
      if (this.#intervalId) {
        clearInterval(this.#intervalId);
        this.#intervalId = null;
      }
    }
  }

  return SchedulerRuntimeService;
}
