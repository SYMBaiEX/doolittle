import { DatabaseTrajectoryLogger } from "@elizaos/agent/runtime/trajectory-persistence";
import {
  KnowledgeGraphService,
  knowledgeGraphSchema,
} from "@elizaos/agent/services/knowledge-graph/index";
import {
  ApprovalService,
  type Plugin,
  PluginManagerService,
  ToolPolicyService,
} from "@elizaos/core";

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
        "Official ElizaOS knowledge, approval, policy, and trajectory services.",
      schema: knowledgeGraphSchema,
      services: [
        KnowledgeGraphService,
        ApprovalService,
        ToolPolicyService,
        DatabaseTrajectoryLogger,
        PluginManagerService,
      ],
    },
  ];
}
