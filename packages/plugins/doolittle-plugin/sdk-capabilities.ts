import { DOOLITTLE_SDK_CAPABILITIES_SERVICE } from "@doolittle/contracts";
import { getGlobalAwarenessRegistry } from "@elizaos/agent/awareness/registry";
import {
  registerTriggerTaskWorker,
  triggersFeatureEnabled,
} from "@elizaos/agent/triggers/runtime";
import {
  Service as ElizaService,
  EventType,
  type IAgentRuntime,
  type PluginEvents,
  type Service,
  type ServiceClass,
  type Task,
  type TaskWorker,
  type UUID,
} from "@elizaos/core";

const SELF_MAINTENANCE_TASK = "DOOLITTLE_SELF_MAINTENANCE";
const SELF_MAINTENANCE_TASK_ID = "d0010000-0000-4000-8000-000000000001" as UUID;
const SELF_MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Declares additional ElizaOS SDK capabilities that have no dedicated
 * Doolittle surface yet:
 *
 *  - `HOOK_TOOL_AFTER` audit observability for every tool invocation,
 *  - the autonomous trigger dispatch worker (interval / once / cron triggers),
 *  - a self-maintenance `TaskWorker` that keeps the self-awareness summary
 *    (see the self-awareness provider) fresh on a recurring schedule.
 *
 * Tool observation is a native plugin event. Task workers and persisted tasks
 * are owned by an Eliza service so they start only after runtime initialization
 * and stop with the runtime.
 */
export function createSdkCapabilityEvents(): PluginEvents {
  return {
    [EventType.HOOK_TOOL_AFTER]: [
      async (payload) => {
        payload.runtime.logger?.debug?.(
          {
            src: "doolittle:tool-audit",
            tool: payload.toolName,
            ok: payload.result !== undefined,
          },
          "[DOOLITTLE] tool executed",
        );
      },
    ],
  };
}

/** Enable the autonomous trigger system when the runtime allows it. */
function enableAutonomousTriggers(runtime: IAgentRuntime): void {
  try {
    if (triggersFeatureEnabled(runtime)) {
      registerTriggerTaskWorker(runtime);
    }
  } catch (error) {
    runtime.logger?.warn?.(
      { error },
      "[DOOLITTLE] failed to enable autonomous triggers",
    );
  }
}

/**
 * Register (and, once, schedule) a recurring SDK task that refreshes the
 * self-awareness summary cache. Idempotent across restarts via a fixed task id.
 */
async function registerSelfMaintenanceTask(
  runtime: IAgentRuntime,
): Promise<void> {
  try {
    const worker: TaskWorker = {
      name: SELF_MAINTENANCE_TASK,
      execute: async () => {
        getGlobalAwarenessRegistry()?.invalidate("config-changed");
        return { nextInterval: SELF_MAINTENANCE_INTERVAL_MS };
      },
    };
    runtime.registerTaskWorker(worker);

    const existing = await runtime.getTask(SELF_MAINTENANCE_TASK_ID);
    if (!existing) {
      const task: Task = {
        id: SELF_MAINTENANCE_TASK_ID,
        name: SELF_MAINTENANCE_TASK,
        description:
          "Periodically refreshes the agent self-awareness summary cache.",
        tags: ["repeat", "doolittle-maintenance"],
        metadata: { updateInterval: SELF_MAINTENANCE_INTERVAL_MS },
      };
      await runtime.createTask(task);
    }
  } catch (error) {
    runtime.logger?.warn?.(
      { error },
      "[DOOLITTLE] failed to register self-maintenance task",
    );
  }
}

export function createSdkCapabilitiesRuntimeService(): ServiceClass {
  class SdkCapabilitiesRuntimeService extends ElizaService {
    static serviceType = DOOLITTLE_SDK_CAPABILITIES_SERVICE;

    capabilityDescription =
      "Owns Doolittle trigger workers and recurring SDK maintenance tasks.";

    // biome-ignore lint/complexity/noUselessConstructor: ElizaOS ServiceClass expects an optional runtime constructor.
    constructor(runtime?: IAgentRuntime) {
      super(runtime);
    }

    static async start(runtime: IAgentRuntime): Promise<Service> {
      enableAutonomousTriggers(runtime);
      await registerSelfMaintenanceTask(runtime);
      return new SdkCapabilitiesRuntimeService(runtime);
    }

    async stop(): Promise<void> {
      this.runtime.unregisterTaskWorker(SELF_MAINTENANCE_TASK);
    }
  }

  return SdkCapabilitiesRuntimeService;
}
