import type { Evaluator, Memory } from "@elizaos/core";
import { messageUserId } from "@/runtime/message-user";
import type { AppServices } from "@/services";

type MemoryNudgePrepared = {
  fact: string;
  target: "user" | "memory";
};

const REMEMBER_CUE = /remember|save that|keep in mind/iu;
const MEMORY_NUDGE_SCHEMA = {
  type: "string",
  enum: ["STORE"],
  description:
    'Always return "STORE". Doolittle persists explicit remember/save cues deterministically in a processor.',
};

function extractText(message: Memory): string {
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }
  return content?.text ?? "";
}

function extractMemoryNudge(message: Memory): MemoryNudgePrepared | null {
  const text = extractText(message);
  if (!text || !REMEMBER_CUE.test(text)) {
    return null;
  }

  return {
    fact: text
      .replace(
        /^\s*(?:please\s+)?(?:remember|save that|keep in mind)\s*(?:that\s*)?/iu,
        "",
      )
      .trim(),
    target: /\b(?:i prefer|my preference|remember that i)\b/iu.test(text)
      ? "user"
      : "memory",
  };
}

/**
 * Persists explicit "remember this" cues into the Doolittle memory stores.
 *
 * The beta evaluator contract still requires schema/prompt plumbing, but the
 * storage behavior stays deterministic in prepare/processors.
 */
export function createMemoryNudgeEvaluator(
  services: AppServices,
): Evaluator<"STORE", MemoryNudgePrepared> {
  return {
    name: "memoryNudge",
    description:
      "Stores explicit remember/save cues in the persistent memory stores.",
    similes: ["remember this", "save preference", "persist fact"],
    schema: MEMORY_NUDGE_SCHEMA,
    shouldRun: async ({ message }) => {
      return extractMemoryNudge(message) !== null;
    },
    prepare: async ({ message }) => {
      return extractMemoryNudge(message) ?? { fact: "", target: "memory" };
    },
    prompt: ({ prepared }) => {
      if (!prepared.fact) {
        return [
          'Return "STORE".',
          "An explicit remember/save cue was detected, but it did not include a fact to persist.",
          "No additional extraction is needed.",
        ].join("\n");
      }

      return [
        'Return "STORE".',
        `Doolittle will deterministically persist this explicit memory request to the ${prepared.target} store.`,
        `Prepared fact: "${prepared.fact}"`,
      ].join("\n");
    },
    parse: () => "STORE",
    processors: [
      {
        name: "persist-memory-nudge",
        process: async ({ prepared, message }) => {
          if (!prepared.fact) {
            return undefined;
          }

          try {
            services.memory.add(
              prepared.target,
              prepared.fact,
              messageUserId(message),
            );
          } catch {
            // Ignore duplicate or over-limit writes inside the evaluator path.
          }

          return undefined;
        },
      },
    ],
  };
}
