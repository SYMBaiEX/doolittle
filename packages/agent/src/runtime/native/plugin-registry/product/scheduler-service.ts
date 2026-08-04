import { DOOLITTLE_SCHEDULER_SERVICE } from "@doolittle/contracts";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Service,
  type ServiceClass,
} from "@elizaos/core";
import type { AppServices } from "@/services";

export function createSchedulerRuntimeService(
  services: AppServices,
): ServiceClass {
  class SchedulerRuntimeService extends ElizaService {
    static serviceType = DOOLITTLE_SCHEDULER_SERVICE;

    capabilityDescription =
      "Runs Doolittle session maintenance beside Eliza Trigger Tasks.";

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
      if (this.#intervalId) {
        clearInterval(this.#intervalId);
        this.#intervalId = null;
      }
    }
  }

  return SchedulerRuntimeService;
}
