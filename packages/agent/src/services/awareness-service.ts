/**
 * Self-awareness integration via @elizaos/autonomous AwarenessRegistry.
 */

import type { IAgentRuntime } from "@elizaos/core";
import {
  AwarenessRegistry,
  setGlobalAwarenessRegistry,
} from "@elizaos/autonomous/awareness/registry";
import type { AwarenessContributor } from "@elizaos/autonomous/contracts/awareness";
import type { AppServices } from "./index";

function createRuntimeContributor(): AwarenessContributor {
  return {
    id: "runtime",
    position: 10,
    trusted: true,
    cacheTtl: 30_000,
    invalidateOn: ["runtime-restarted", "config-changed"],
    summary: async (runtime: IAgentRuntime) => {
      const name = runtime.character?.name ?? "Eliza Agent";
      const pluginCount =
        (runtime as unknown as { plugins?: unknown[] }).plugins?.length ?? "?";
      return `${name} · ${pluginCount} plugins · runtime ok`;
    },
    detail: async (runtime: IAgentRuntime, level) => {
      const char = runtime.character;
      const lines = [
        `Agent: ${char?.name ?? "unknown"}`,
        `ID: ${runtime.agentId}`,
        `Plugins: ${(runtime as unknown as { plugins?: unknown[] }).plugins?.length ?? "?"}`,
      ];
      if (level === "full") {
        lines.push(`Bio: ${Array.isArray(char?.bio) ? char.bio.join(" ") : char?.bio ?? "—"}`);
      }
      return lines.join("\n");
    },
  };
}

function createBudgetContributor(services: AppServices): AwarenessContributor {
  return {
    id: "iteration-budget",
    position: 15,
    trusted: true,
    cacheTtl: 5_000,
    summary: async () => {
      const count = services.iterationBudget.activeCount();
      if (count === 0) return "";
      const summaries = services.iterationBudget.summary();
      return summaries[0] ?? `${count} active budgets`;
    },
    detail: async (_runtime, level) => {
      const summaries = services.iterationBudget.summary();
      if (summaries.length === 0) return "No active iteration budgets.";
      if (level === "brief") return summaries.join("; ");
      return ["Active iteration budgets:", ...summaries.map((s) => `  ${s}`)].join("\n");
    },
  };
}

function createSettingsContributor(services: AppServices): AwarenessContributor {
  return {
    id: "settings",
    position: 20,
    trusted: true,
    cacheTtl: 60_000,
    invalidateOn: ["config-changed"],
    summary: async () => {
      const s = services.settings.get();
      return `depth=${s.agent.runDepth} iters=${s.agent.maxIterations}`;
    },
    detail: async (_runtime, level) => {
      const s = services.settings.get();
      const lines = [
        `Run depth: ${s.agent.runDepth}`,
        `Max iterations: ${s.agent.maxIterations}`,
        `Tool progress: ${s.agent.toolProgressMode}`,
      ];
      if (level === "full") {
        lines.push(`Model provider: ${s.model.provider}`, `Model: ${s.model.model}`);
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
    cacheTtl: 120_000,
    summary: async () => "multiStep=on advMemory=on advPlanning=on",
    detail: async (_runtime, level) => {
      const lines = [
        "Multi-step agentic loop: enabled",
        "Advanced memory (summarization + long-term extraction): enabled",
        "Advanced planning: enabled",
        "Reflection evaluator: enabled",
        "Relationship extraction evaluator: enabled",
      ];
      if (level === "full") {
        lines.push(
          "Context compression: enabled",
          "Iteration budget tracking: enabled",
          "Budget pressure warnings: enabled",
        );
      }
      return lines.join("\n");
    },
  };
}

export class AwarenessService {
  private registry: AwarenessRegistry | null = null;

  initialize(services: AppServices): void {
    try {
      const registry = new AwarenessRegistry();
      registry.register(createRuntimeContributor());
      registry.register(createBudgetContributor(services));
      registry.register(createSettingsContributor(services));
      registry.register(createCapabilitiesContributor());
      setGlobalAwarenessRegistry(registry);
      this.registry = registry;
    } catch {
      // Non-fatal
    }
  }

  getRegistry(): AwarenessRegistry | null {
    return this.registry;
  }

  registerContributor(contributor: AwarenessContributor): void {
    this.registry?.register(contributor);
  }

  invalidate(
    event:
      | "permission-changed"
      | "plugin-changed"
      | "wallet-updated"
      | "provider-changed"
      | "config-changed"
      | "runtime-restarted"
      | "opinion-updated",
  ): void {
    this.registry?.invalidate(event);
  }

  async composeSummary(runtime: IAgentRuntime): Promise<string> {
    if (!this.registry) return "";
    try {
      return await this.registry.composeSummary(runtime);
    } catch {
      return "";
    }
  }
}
