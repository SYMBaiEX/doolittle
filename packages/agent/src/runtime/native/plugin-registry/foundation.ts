import {
  KnowledgeGraphService,
  knowledgeGraphSchema,
} from "@elizaos/agent/services/knowledge-graph/index";
import type { Plugin } from "@elizaos/core";

/**
 * Mount the stable, independently importable Eliza foundation services.
 *
 * The beta.7 aggregate Eliza plugin currently imports an unpublished
 * relationships-graph-builder module at runtime. Registering the official
 * knowledge graph service and schema directly keeps Doolittle on the SDK
 * primitive without copying or wrapping its implementation.
 */
export function loadFoundationPlugins(): Plugin[] {
  return [
    {
      name: "@elizaos/agent-knowledge-graph",
      description:
        "Official ElizaOS entity and relationship knowledge graph service.",
      schema: knowledgeGraphSchema,
      services: [KnowledgeGraphService],
    },
  ];
}
