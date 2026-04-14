import type { Plugin } from "@elizaos/core";
import type { MemoryTarget } from "../../../../types/runtime";
import type { DeferredPluginGroupContext } from "./shared";

export async function loadDeferredKnowledgePlugins({
  services,
}: DeferredPluginGroupContext): Promise<Plugin[]> {
  const { createKnowledgePlugin } = await import("@elizaos/plugin-knowledge");

  return [
    createKnowledgePlugin({
      knowledge: {
        extractPdf: (path) => services.documents.extractPdf(path),
      },
      memory: {
        list: (target: MemoryTarget = "memory") => services.memory.list(target),
        remember: (
          target: MemoryTarget,
          input: { text: string; source: string },
        ) => services.memory.remember(target, input),
        read: (target: MemoryTarget = "memory") => services.memory.read(target),
        summary: (target: MemoryTarget = "memory") =>
          services.memory.summary(target),
      },
      sessions: services.sessions,
    }),
  ];
}
