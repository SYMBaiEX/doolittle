import { createAssistantPlugins } from "@elizaos/agent/runtime/assistant-plugins";
import { ElizaCharacterPersistenceService } from "@elizaos/agent/services/character-persistence";
import { LocalFileStorageService } from "@elizaos/agent/services/file-storage";
import { AgentMediaGenerationService } from "@elizaos/agent/services/media-generation";
import { PermissionRegistry } from "@elizaos/agent/services/permissions-registry";
import {
  AgentEventService,
  ApprovalService,
  HookService,
  PairingService,
  type ServiceClass,
} from "@elizaos/core";
import type { HttpPlugin as Plugin } from "@elizaos/host/protocol";
import {
  autonomyCapabilities,
  GlobalPauseService,
  HandoffService,
  PendingPromptsService,
} from "@elizaos/plugin-assistant";
import { browserPlugin } from "@elizaos/plugin-browser";
import character from "../../../character";

const autonomyRoutes = autonomyCapabilities.routes.map((route) => ({
  ...route,
  // AgentRuntime namespaces plugin routes by default. These are public,
  // first-party Eliza routes whose documented contract is rooted at
  // `/autonomy/*`, so preserve that contract when mounting them in the
  // aggregate-safe foundation plugin.
  rawPath: true,
}));

// PairingService's constructor requires a runtime while ServiceClass
// still declares that constructor argument optional. Runtime registration uses
// the compatible static start contract, so keep the mismatch isolated here.
const PairingServiceClass = PairingService as unknown as ServiceClass;

// The SDK ServiceClass declaration permits an optional constructor runtime,
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
 * Use the SDK's public assistant composition and explicit host services while
 * retaining Doolittle's own client actions and transport routes.
 */
export function loadFoundationPlugins(worker = false): Plugin[] {
  return [
    ...createAssistantPlugins({
      ...character,
      advancedMemory: true,
      advancedPlanning: true,
    }),
    {
      name: "doolittle-eliza-foundation",
      description:
        "Official ElizaOS knowledge, hooks, approval, action authority and autonomy capabilities.",
      actions: worker ? [] : autonomyCapabilities.actions,
      providers: worker ? [] : autonomyCapabilities.providers,
      services: [
        AgentEventService,
        HookService,
        PermissionRegistryClass,
        PendingPromptsServiceClass,
        GlobalPauseServiceClass,
        HandoffServiceClass,
        ApprovalService,
        ...(worker ? [] : [PairingServiceClass]),
        CharacterPersistenceServiceClass,
        LocalFileStorageServiceClass,
        MediaGenerationServiceClass,
        ...(worker ? [] : autonomyCapabilities.services),
      ],
      routes: worker ? [] : autonomyRoutes,
    },
    ...(worker ? [] : [browserPlugin]),
  ];
}
