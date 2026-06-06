import type {
  Evaluator,
  EvaluatorProcessorContext,
  EvaluatorPromptContext,
  EvaluatorRunContext,
  JSONSchema,
  Memory,
} from "@elizaos/core";
import type { AppServices } from "@/services";

type MemoryNudgeOutput = {
  shouldStore: boolean;
  target: "user" | "memory";
  fact: string;
};

const MEMORY_NUDGE_SCHEMA: JSONSchema = {
  type: "object",
  additionalProperties: false,
  required: ["shouldStore", "target", "fact"],
  properties: {
    shouldStore: {
      type: "boolean",
      description: "Whether the message contains a durable fact worth saving.",
    },
    target: {
      type: "string",
      enum: ["user", "memory"],
      description:
        'Use "user" for personal preferences about the user, otherwise "memory".',
    },
    fact: {
      type: "string",
      description: "The normalized fact to persist, without the leading cue.",
    },
  },
};

const REMEMBER_CUE = /remember|save that|keep in mind/iu;

function extractText(message: Memory): string {
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }
  return content?.text ?? "";
}

/**
 * Persists explicit "remember this" cues into the Doolittle memory stores.
 *
 * Rewritten for the ElizaOS 2.0 beta evaluator contract: the regex still gates
 * whether the evaluator runs, but fact extraction is delegated to the model
 * (via `schema`/`prompt`/`parse`) and the write happens in a processor.
 */
export function createMemoryNudgeEvaluator(
  services: AppServices,
): Evaluator<MemoryNudgeOutput> {
  return {
    name: "memoryNudge",
    description:
      "Stores explicit remember/save cues in the persistent memory stores.",
    similes: ["remember this", "save preference", "persist fact"],
    schema: MEMORY_NUDGE_SCHEMA,
    shouldRun: async ({ message }: EvaluatorRunContext) => {
      const text = extractText(message);
      return Boolean(text && REMEMBER_CUE.test(text));
    },
    prompt: ({ message }: EvaluatorPromptContext) => {
      const text = extractText(message);
      return [
        "The user asked the agent to remember something.",
        `Message: "${text}"`,
        "",
        "Decide whether there is a durable fact worth persisting.",
        'Set "target" to "user" for personal preferences (for example "I prefer",',
        '"my preference", "remember that I"), otherwise "memory".',
        'Strip leading cues such as "please" or "remember that" from the stored fact.',
      ].join("\n");
    },
    parse: (output: unknown): MemoryNudgeOutput | null => {
      if (!output || typeof output !== "object") {
        return null;
      }
      const candidate = output as Record<string, unknown>;
      const fact =
        typeof candidate.fact === "string" ? candidate.fact.trim() : "";
      if (!fact) {
        return null;
      }
      return {
        shouldStore: candidate.shouldStore !== false,
        target: candidate.target === "user" ? "user" : "memory",
        fact,
      };
    },
    processors: [
      {
        name: "persist-memory-nudge",
        process: async ({
          output,
        }: EvaluatorProcessorContext<MemoryNudgeOutput>) => {
          if (!output.shouldStore || !output.fact) {
            return undefined;
          }
          try {
            services.memory.add(output.target, output.fact);
          } catch {
            // Ignore duplicate or over-limit writes inside the evaluator path.
          }
          return undefined;
        },
      },
    ],
  };
}
