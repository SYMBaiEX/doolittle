import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

export interface KnowledgePluginOptions {
  knowledge: {
    extractPdf(path: string): Promise<string>;
  };
  memory: {
    list(target?: "memory" | "user"): string[];
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
    summary(target?: "memory" | "user"): {
      target: "memory" | "user";
      entries: number;
      characters: number;
      preview: string[];
    };
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
  class KnowledgeService extends ElizaService {
    static serviceType = "knowledge";
    capabilityDescription =
      "Official-style knowledge ingestion and recall service for Eliza Agent.";

    static async start(_runtime: IAgentRuntime): Promise<ElizaService> {
      return new KnowledgeService(_runtime);
    }

    async stop(): Promise<void> {
      return;
    }

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
    }

    remember(text: string, source = "knowledge:manual") {
      return options.memory.remember("memory", { text, source });
    }

    summary(target: "memory" | "user" = "memory") {
      return options.memory.summary(target);
    }

    recall(query: string, limit = 8) {
      return {
        memory: options.memory.read("memory"),
        sessions: options.sessions.search(query, limit),
      };
    }
  }

  return {
    name: "knowledge",
    description:
      "Official-style knowledge service layered onto Eliza Agent memory and document ingestion.",
    services: [KnowledgeService],
  };
}

export default createKnowledgePlugin;
