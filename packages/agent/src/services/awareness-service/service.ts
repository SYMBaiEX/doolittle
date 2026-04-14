import {
  AwarenessRegistry,
  setGlobalAwarenessRegistry,
} from "@elizaos/autonomous/awareness/registry";
import type {
  AwarenessContributor,
  AwarenessInvalidationEvent,
} from "@elizaos/autonomous/contracts/awareness";
import type { IAgentRuntime } from "@elizaos/core";
import type { AppServices } from "../types";
import { createRunContributor } from "./budget";
import { countContributors, createAwarenessServiceState } from "./state";
import {
  createCapabilitiesContributor,
  createRuntimeContributor,
  createSettingsContributor,
  createStartupContributor,
} from "./summary";

export class AwarenessService {
  private readonly state = createAwarenessServiceState();

  initialize(services: AppServices): void {
    if (this.state.registry) {
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
      this.state.registry = registry;
    } catch {
      this.state.registry = null;
    }
  }

  isInitialized(): boolean {
    return this.state.registry !== null;
  }

  contributorCount(): number {
    return countContributors(this.state);
  }

  getRegistry(): AwarenessRegistry | null {
    return this.state.registry;
  }

  registerContributor(contributor: AwarenessContributor): void {
    this.state.registry?.register(contributor);
  }

  invalidate(event: AwarenessInvalidationEvent): void {
    this.state.registry?.invalidate(event);
  }

  async composeSummary(runtime: IAgentRuntime): Promise<string> {
    if (!this.state.registry) {
      return "";
    }
    try {
      return await this.state.registry.composeSummary(runtime);
    } catch {
      return "";
    }
  }
}
