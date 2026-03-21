import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos/plugin-compat";

export interface KnowledgePluginOptions {
  knowledge: {
    extractPdf(path: string): Promise<string>;
  };
  memory: {
    remember(
      target: "memory" | "user",
      input: { text: string; source: string },
    ): {
      ok: boolean;
      stored: string;
      totalLength: number;
      truncated: boolean;
    };
    read(target?: "memory" | "user"): string;
  };
  sessions: {
    search(
      query: string,
      limit: number,
    ): Array<{
      sessionId: string;
      createdAt: string;
      role: "user" | "assistant" | "system";
      text: string;
    }>;
  };
}

export function createKnowledgePlugin(options: KnowledgePluginOptions): Plugin {
  const KnowledgeService = createServiceAdapter({
    serviceType: "knowledge",
    capabilityDescription:
      "Official-style knowledge ingestion and recall service for Eliza Agent.",
    create: async () => ({
      async ingestPdf(path: string) {
        const text = await options.knowledge.extractPdf(path);
        const stored = options.memory.remember("memory", {
          text,
          source: `knowledge:${path}`,
        });
        return {
          path,
          text,
          stored,
        };
      },
      remember(text: string, source = "knowledge:manual") {
        return options.memory.remember("memory", { text, source });
      },
      recall(query: string, limit = 8) {
        return {
          memory: options.memory.read("memory"),
          sessions: options.sessions.search(query, limit),
        };
      },
    }),
  });

  return createServicePlugin(
    "knowledge",
    "Official-style knowledge service layered onto Eliza Agent memory and document ingestion.",
    KnowledgeService,
  );
}

export default createKnowledgePlugin;
