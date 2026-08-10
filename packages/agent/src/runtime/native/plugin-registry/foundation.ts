import { ElizaCharacterPersistenceService } from "@elizaos/agent/services/character-persistence";
import { LocalFileStorageService } from "@elizaos/agent/services/file-storage";
import { GlobalPauseService } from "@elizaos/agent/services/global-pause/index";
import { HandoffService } from "@elizaos/agent/services/handoff/index";
import {
  KnowledgeGraphService,
  knowledgeGraphSchema,
} from "@elizaos/agent/services/knowledge-graph/index";
import { AgentMediaGenerationService } from "@elizaos/agent/services/media-generation";
import { PendingPromptsService } from "@elizaos/agent/services/pending-prompts/index";
import { PermissionRegistry } from "@elizaos/agent/services/permissions-registry";
import {
  AgentEventService,
  ApprovalService,
  autonomyCapabilities,
  HookService,
  PairingService,
  type Plugin,
  PluginManagerService,
  type ServiceClass,
  ToolPolicyService,
} from "@elizaos/core";
import { browserPlugin } from "@elizaos/plugin-browser";

// beta.7's PairingService constructor requires a runtime while ServiceClass
// still declares that constructor argument optional. Runtime registration uses
// the compatible static start contract, so keep the mismatch isolated here.
const PairingServiceClass = PairingService as unknown as ServiceClass;

// beta.7's ServiceClass declaration permits an optional constructor runtime,
// while several official service classes require one. Their static start
// methods are the runtime registration contract, so isolate that declaration
// mismatch rather than wrapping or reimplementing the services.
const PermissionRegistryClass = PermissionRegistry as unknown as ServiceClass;
const PendingPromptsServiceClass =
  PendingPromptsService as unknown as ServiceClass;
const GlobalPauseServiceClass = GlobalPauseService as unknown as ServiceClass;
const HandoffServiceClass = HandoffService as unknown as ServiceClass;
const CharacterPersistenceServiceClass =
  ElizaCharacterPersistenceService as unknown as ServiceClass;
const LocalFileStorageServiceClass =
  LocalFileStorageService as unknown as ServiceClass;
const MediaGenerationServiceClass =
  AgentMediaGenerationService as unknown as ServiceClass;

/**
 * Mount the stable, independently importable Eliza foundation services.
 *
 * The beta.7 aggregate Eliza plugin currently imports an unpublished
 * relationships-graph-builder module at runtime and also registers product
 * actions, routes, and init hooks. Registering only these official service
 * classes keeps Doolittle on SDK primitives without copying, wrapping, or
 * introducing those desktop/API-incompatible aggregate-plugin side effects.
 */
export function loadFoundationPlugins(): Plugin[] {
  return [
    {
      name: "doolittle-eliza-foundation",
      description:
        "Official ElizaOS knowledge, hooks, approval, policy, plugin-management, and autonomy capabilities.",
      actions: autonomyCapabilities.actions,
      providers: autonomyCapabilities.providers,
      schema: knowledgeGraphSchema,
      services: [
        AgentEventService,
        HookService,
        PermissionRegistryClass,
        KnowledgeGraphService,
        PendingPromptsServiceClass,
        GlobalPauseServiceClass,
        HandoffServiceClass,
        ApprovalService,
        PairingServiceClass,
        ToolPolicyService,
        PluginManagerService,
        CharacterPersistenceServiceClass,
        LocalFileStorageServiceClass,
        MediaGenerationServiceClass,
        ...autonomyCapabilities.services,
      ],
      routes: autonomyCapabilities.routes,
    },
    browserPlugin,
  ];
}
