import {
  KnowledgeGraphService,
  knowledgeGraphSchema,
} from "@elizaos/agent/services/knowledge-graph/index";
import {
  ApprovalService,
  PairingService,
  type Plugin,
  PluginManagerService,
  type ServiceClass,
  ToolPolicyService,
} from "@elizaos/core";

// beta.7's PairingService constructor requires a runtime while ServiceClass
// still declares that constructor argument optional. Runtime registration uses
// the compatible static start contract, so keep the mismatch isolated here.
const PairingServiceClass = PairingService as unknown as ServiceClass;

/**
 * Mount the stable, independently importable Eliza foundation services.
 *
 * The beta.7 aggregate Eliza plugin currently imports an unpublished
 * relationships-graph-builder module at runtime. Registering the official
 * service classes directly keeps Doolittle on SDK primitives without copying,
 * wrapping, or registering them after runtime initialization.
 */
export function loadFoundationPlugins(): Plugin[] {
  return [
    {
      name: "@elizaos/agent-knowledge-graph",
      description:
        "Official ElizaOS knowledge, approval, policy, and plugin-management services.",
      schema: knowledgeGraphSchema,
      services: [
        KnowledgeGraphService,
        ApprovalService,
        PairingServiceClass,
        ToolPolicyService,
        PluginManagerService,
      ],
    },
  ];
}
