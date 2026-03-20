import type { Evaluator, IAgentRuntime, Memory } from "@elizaos/core";
import type { AppServices } from "@/services";

export function createMemoryNudgeEvaluator(services: AppServices): Evaluator {
  return {
    name: "memoryNudge",
    description: "Stores explicit remember/save cues in the persistent memory stores.",
    alwaysRun: true,
    similes: ["remember this", "save preference", "persist fact"],
    examples: [
      {
        prompt: "Remember that this repository uses Bun only.",
        messages: [
          {
            name: "user",
            content: {
              text: "Remember that this repository uses Bun only.",
            },
          },
        ],
        outcome: "The evaluator saves the preference into user or project memory.",
      },
    ],
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text = typeof message.content === "string" ? message.content : message.content?.text;
      return Boolean(text && /remember|save that|keep in mind/iu.test(text));
    },
    handler: async (_runtime: IAgentRuntime, message: Memory) => {
      const text = typeof message.content === "string" ? message.content : message.content?.text;
      if (!text) {
        return undefined;
      }

      const target = /i prefer|my preference|remember that i/iu.test(text) ? "user" : "memory";
      const normalized = text
        .replace(/^please\s+/iu, "")
        .replace(/^remember that\s+/iu, "")
        .trim();

      try {
        services.memory.add(target, normalized);
      } catch {
        // Ignore duplicate or over-limit writes inside the evaluator path.
      }

      return undefined;
    },
  };
}
