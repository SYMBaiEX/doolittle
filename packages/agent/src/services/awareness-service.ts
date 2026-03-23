/**
 * Self-awareness integration via @elizaos/autonomous AwarenessRegistry.
 */

import {
  AwarenessRegistry,
  setGlobalAwarenessRegistry,
} from "@elizaos/autonomous/awareness/registry";
import type {
  AwarenessContributor,
  AwarenessInvalidationEvent,
} from "@elizaos/autonomous/contracts/awareness";
import type { IAgentRuntime } from "@elizaos/core";
import type { AppServices } from "./index";

function activeRuns(services: AppServices) {
  return services.runController
    .listActive()
    .filter((run) => run.endedAt === undefined);
}

function createRuntimeContributor(): AwarenessContributor {
  return {
    id: "runtime",
    position: 10,
    trusted: true,
    cacheTtl: 30_000,
    invalidateOn: ["runtime-restarted", "config-changed"],
    summary: async (runtime) => {
      const name = runtime.character?.name ?? "Eliza Agent";
      const pluginCount =
        (runtime as { plugins?: unknown[] }).plugins?.length ?? "?";
      return `${name} · ${pluginCount} plugins · runtime ok`;
    },
    detail: async (runtime, level) => {
      const character = runtime.character;
      const lines = [
        `Agent: ${character?.name ?? "unknown"}`,
        `ID: ${runtime.agentId}`,
        `Plugins: ${(runtime as { plugins?: unknown[] }).plugins?.length ?? "?"}`,
      ];
      if (level === "full") {
        lines.push(
          `Bio: ${Array.isArray(character?.bio) ? character.bio.join(" ") : (character?.bio ?? "—")}`,
        );
      }
      return lines.join("\n");
    },
  };
}

function createRunContributor(services: AppServices): AwarenessContributor {
  return {
    id: "run",
    position: 15,
    trusted: true,
    cacheTtl: 5_000,
    summary: async () => {
      const runs = activeRuns(services);
      if (runs.length === 0) {
        return `run=idle bridge=${services.runController.hasRuntimeBridge() ? "on" : "off"}`;
      }
      if (runs.length > 1) {
        return `${runs.length} active runs · bridge=${services.runController.hasRuntimeBridge() ? "on" : "off"}`;
      }
      const [run] = runs;
      const approvals =
        run.pendingApprovals > 0 ? ` · approvals ${run.pendingApprovals}` : "";
      const action = run.activeAction ? ` · ${run.activeAction}` : "";
      return `${run.status} · ${run.runDepth} · cap ${run.configuredMaxIterations} · steps ${run.observedActionCount}${approvals}${action}`;
    },
    detail: async () => {
      const runs = activeRuns(services);
      if (runs.length === 0) {
        return [
          "No active runs.",
          `Runtime bridge: ${services.runController.hasRuntimeBridge() ? "attached" : "missing"}`,
          `Agent-event bridge: ${services.runController.hasAgentEventBridge() ? "attached" : "missing"}`,
        ].join("\n");
      }
      return runs
        .map((run) =>
          [
            `Run ${run.runId}`,
            `  Session: ${run.sessionId}`,
            `  Status: ${run.status}`,
            `  Run depth: ${run.runDepth}`,
            `  Max iterations: ${run.configuredMaxIterations}`,
            `  Observed actions: ${run.observedActionCount}`,
            `  Pending approvals: ${run.pendingApprovals}`,
            `  Active action: ${run.activeAction ?? "—"}`,
            `  Last action: ${run.lastAction ?? "—"}`,
          ].join("\n"),
        )
        .join("\n");
    },
  };
}

function createStartupContributor(services: AppServices): AwarenessContributor {
  return {
    id: "startup",
    position: 18,
    trusted: true,
    cacheTtl: 10_000,
    summary: async () => {
      const snapshot = services.startupState.getSnapshot();
      return `startup hot=${snapshot.hotPathReady ? "ready" : "warming"} deferred=${snapshot.deferredReady ? "ready" : "warming"}`;
    },
    detail: async () => {
      const snapshot = services.startupState.getSnapshot();
      return Object.values(snapshot.phases)
        .map(
          (phase) =>
            `${phase.id}: ${phase.status}${phase.detail ? ` (${phase.detail})` : ""}`,
        )
        .join("\n");
    },
  };
}

function createSettingsContributor(
  services: AppServices,
): AwarenessContributor {
  return {
    id: "settings",
    position: 20,
    trusted: true,
    cacheTtl: 60_000,
    invalidateOn: ["config-changed", "provider-changed"],
    summary: async () => {
      const settings = services.settings.get();
      return `depth=${settings.agent.runDepth} cap=${settings.agent.maxIterations} progress=${settings.agent.toolProgressMode}`;
    },
    detail: async (_runtime, level) => {
      const settings = services.settings.get();
      const lines = [
        `Run depth: ${settings.agent.runDepth}`,
        `Max iterations: ${settings.agent.maxIterations}`,
        `Tool progress: ${settings.agent.toolProgressMode}`,
      ];
      if (level === "full") {
        lines.push(
          `Model provider: ${settings.model.provider}`,
          `Model: ${settings.model.model}`,
        );
      }
      return lines.join("\n");
    },
  };
}

function createCapabilitiesContributor(): AwarenessContributor {
  return {
    id: "capabilities",
    position: 50,
    trusted: true,
    cacheTtl: 30_000,
    summary: async (runtime) => {
      const character = runtime.character as
        | {
            advancedMemory?: boolean;
            advancedPlanning?: boolean;
          }
        | undefined;
      return `memory=${character?.advancedMemory ? "adv" : "std"} planning=${character?.advancedPlanning ? "adv" : "std"}`;
    },
    detail: async (runtime) => {
      const character = runtime.character as
        | {
            advancedMemory?: boolean;
            advancedPlanning?: boolean;
          }
        | undefined;
      return [
        `Advanced memory: ${character?.advancedMemory ? "enabled" : "disabled"}`,
        `Advanced planning: ${character?.advancedPlanning ? "enabled" : "disabled"}`,
      ].join("\n");
    },
  };
}

export class AwarenessService {
  private registry: AwarenessRegistry | null = null;

  initialize(services: AppServices): void {
    if (this.registry) {
      return;
    }

    try {
      const registry = new AwarenessRegistry();
      registry.register(createRuntimeContributor());
      registry.register(createRunContributor(services));
      registry.register(createStartupContributor(services));
      registry.register(createSettingsContributor(services));
      registry.register(createCapabilitiesContributor());
      setGlobalAwarenessRegistry(registry);
      this.registry = registry;
    } catch {
      this.registry = null;
    }
  }

  isInitialized(): boolean {
    return this.registry !== null;
  }

  contributorCount(): number {
    const registry = this.registry as { contributors?: unknown[] } | null;
    return registry?.contributors?.length ?? 0;
  }

  getRegistry(): AwarenessRegistry | null {
    return this.registry;
  }

  registerContributor(contributor: AwarenessContributor): void {
    this.registry?.register(contributor);
  }

  invalidate(event: AwarenessInvalidationEvent): void {
    this.registry?.invalidate(event);
  }

  async composeSummary(runtime: IAgentRuntime): Promise<string> {
    if (!this.registry) {
      return "";
    }
    try {
      return await this.registry.composeSummary(runtime);
    } catch {
      return "";
    }
  }
}
