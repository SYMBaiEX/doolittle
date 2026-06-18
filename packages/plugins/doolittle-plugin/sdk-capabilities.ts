import { getGlobalAwarenessRegistry } from "@elizaos/autonomous/awareness/registry";
import {
  registerTriggerTaskWorker,
  triggersFeatureEnabled,
} from "@elizaos/autonomous/triggers/runtime";
import {
  EventType,
  type HookToolPayload,
  type IAgentRuntime,
  type Task,
  type TaskWorker,
  type UUID,
} from "@elizaos/core";

const SELF_MAINTENANCE_TASK = "DOOLITTLE_SELF_MAINTENANCE";
const SELF_MAINTENANCE_TASK_ID = "d0010000-0000-4000-8000-000000000001" as UUID;
const SELF_MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Wires additional ElizaOS SDK runtime capabilities that have no dedicated
 * Doolittle surface yet, so the agent leverages the SDK to the fullest:
 *
 *  - `HOOK_TOOL_AFTER` audit observability for every tool invocation,
 *  - the autonomous trigger dispatch worker (interval / once / cron triggers),
 *  - a self-maintenance `TaskWorker` that keeps the self-awareness summary
 *    (see the self-awareness provider) fresh on a recurring schedule.
 *
 * Each step is independently guarded — a failure in one never blocks startup
 * or the others. Called from the Doolittle plugin's `init` once the runtime is
 * available.
 */
export async function wireSdkCapabilities(
  runtime: IAgentRuntime,
): Promise<void> {
  registerToolAuditHook(runtime);
  enableAutonomousTriggers(runtime);
  await registerSelfMaintenanceTask(runtime);
}

/** Observe every tool execution via the SDK tool-hook event stream. */
function registerToolAuditHook(runtime: IAgentRuntime): void {
  try {
    runtime.registerEvent(
      EventType.HOOK_TOOL_AFTER,
      async (payload: HookToolPayload) => {
        runtime.logger?.debug?.(
          {
            src: "doolittle:tool-audit",
            tool: payload.toolName,
            ok: payload.result !== undefined,
          },
          "[DOOLITTLE] tool executed",
        );
      },
    );
  } catch (error) {
    runtime.logger?.warn?.(
      { error },
      "[DOOLITTLE] failed to register tool audit hook",
    );
  }
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
