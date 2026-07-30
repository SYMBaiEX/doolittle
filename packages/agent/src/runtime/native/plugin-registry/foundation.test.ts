import { ElizaCharacterPersistenceService } from "@elizaos/agent/services/character-persistence";
import { LocalFileStorageService } from "@elizaos/agent/services/file-storage";
import { GlobalPauseService } from "@elizaos/agent/services/global-pause/index";
import { HandoffService } from "@elizaos/agent/services/handoff/index";
import { KnowledgeGraphService } from "@elizaos/agent/services/knowledge-graph/index";
import { AgentMediaGenerationService } from "@elizaos/agent/services/media-generation";
import { PendingPromptsService } from "@elizaos/agent/services/pending-prompts/index";
import { PermissionRegistry } from "@elizaos/agent/services/permissions-registry";
import {
  AgentEventService,
  ApprovalService,
  HookService,
  type IAgentRuntime,
  PairingService,
  PluginManagerService,
  ToolPolicyService,
} from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { loadFoundationPlugins } from "./foundation";

describe("foundation plugin ownership", () => {
  it("declares every independently importable core service in plugin assembly", () => {
    const [foundation] = loadFoundationPlugins();

    expect(foundation?.services).toEqual([
      AgentEventService,
      HookService,
      PermissionRegistry,
      KnowledgeGraphService,
      PendingPromptsService,
      GlobalPauseService,
      HandoffService,
      ApprovalService,
      PairingService,
      ToolPolicyService,
      PluginManagerService,
      ElizaCharacterPersistenceService,
      LocalFileStorageService,
      AgentMediaGenerationService,
    ]);
  });

  it("starts and stops each added aggregate-safe service without aggregate plugin hooks", async () => {
    const [foundation] = loadFoundationPlugins();
    const addedServiceTypes = new Set([
      PermissionRegistry.serviceType,
      PendingPromptsService.serviceType,
      GlobalPauseService.serviceType,
      HandoffService.serviceType,
      ElizaCharacterPersistenceService.serviceType,
      LocalFileStorageService.serviceType,
      AgentMediaGenerationService.serviceType,
    ]);
    const services = foundation?.services?.filter((service) =>
      addedServiceTypes.has(service.serviceType),
    );

    expect(services).toHaveLength(7);

    for (const ServiceClass of services ?? []) {
      const service = await ServiceClass.start({} as IAgentRuntime);
      await service.stop();
    }
  });
});
