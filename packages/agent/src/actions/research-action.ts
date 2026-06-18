import {
  type Action,
  type ActionResult,
  type HandlerCallback,
  type HandlerOptions,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type ResearchAnnotation,
  type State,
} from "@elizaos/core";

const RESEARCH_PREFIX = "/research";

function messageText(message: Memory): string {
  return typeof message.content === "string"
    ? message.content
    : (message.content?.text ?? "");
}

function parseResearchQuestion(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith(RESEARCH_PREFIX)) {
    return undefined;
  }
  const question = trimmed.slice(RESEARCH_PREFIX.length).trim();
  return question.length > 0 ? question : undefined;
}

function renderSources(annotations: ResearchAnnotation[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const annotation of annotations) {
    if (!annotation.url || seen.has(annotation.url)) {
      continue;
    }
    seen.add(annotation.url);
    lines.push(`- ${annotation.title || annotation.url} (${annotation.url})`);
  }
  return lines.length > 0 ? `\n\nSources:\n${lines.join("\n")}` : "";
}

/**
 * Adopts the ElizaOS `ModelType.RESEARCH` deep-research model (o3-deep-research)
 * as a first-class action. Triggered by `/research <question>`, it runs the
 * model with web search and returns the cited report.
 *
 * Availability-gated: if no RESEARCH handler is registered (i.e. the OpenAI
 * deep-research provider is not configured via `OPENAI_API_KEY`), the action
 * responds with a clear message instead of failing — so boot and the test
 * suite stay green without a live key, and the capability lights up the moment
 * a key is present.
 */
export function createResearchAction(): Action {
  return {
    name: "DOOLITTLE_RESEARCH",
    similes: ["DEEP_RESEARCH", "RESEARCH_REPORT", "WEB_RESEARCH"],
    description:
      "Runs the ElizaOS deep-research model (ModelType.RESEARCH, e.g. o3-deep-research) over a question with web search and returns a cited report. Triggered by `/research <question>`. Requires a registered RESEARCH model (OPENAI_API_KEY); deep research can take several minutes.",
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      return parseResearchQuestion(messageText(message)) !== undefined;
    },
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      _options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const question = parseResearchQuestion(messageText(message));
      if (!question) {
        const usage = "Usage: /research <a detailed question>";
        await callback?.({ text: usage, source: "research-action" });
        return { success: false, text: usage };
      }

      if (!runtime.getModel(ModelType.RESEARCH)) {
        const unavailable =
          "Deep research is unavailable: no RESEARCH model is registered. Set OPENAI_API_KEY and enable the OpenAI provider to use `/research`.";
        await callback?.({ text: unavailable, source: "research-action" });
        return { success: false, text: unavailable };
      }

      try {
        const result = await runtime.useModel(ModelType.RESEARCH, {
          input: question,
          tools: [{ type: "web_search_preview" }],
        });
        const report = `${result.text}${renderSources(result.annotations ?? [])}`;
        await callback?.({ text: report, source: "research-action" });
        return { success: true, text: report };
      } catch (error) {
        const failure = `Deep research failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
        await callback?.({ text: failure, source: "research-action" });
        return { success: false, text: failure };
      }
    },
    examples: [
      [
        {
          name: "{{userName}}",
          content: {
            text: "/research What are the leading approaches to retrieval-augmented generation in 2026?",
          },
        },
        {
          name: "{{agentName}}",
          content: {
            text: "Here is a cited research report…",
            actions: ["DOOLITTLE_RESEARCH"],
          },
        },
      ],
    ],
  };
}
