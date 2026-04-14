import type { AwarenessContributor } from "@elizaos/autonomous/contracts/awareness";
import type { AppServices } from "../types";

export function createRuntimeContributor(): AwarenessContributor {
  return {
    id: "runtime",
    position: 10,
    trusted: true,
    cacheTtl: 30_000,
    invalidateOn: ["runtime-restarted", "config-changed"],
    summary: async (runtime) => {
      const name = runtime.character?.name ?? "Doolittle";
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

export function createStartupContributor(
  services: AppServices,
): AwarenessContributor {
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

export function createSettingsContributor(
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

export function createCapabilitiesContributor(): AwarenessContributor {
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
