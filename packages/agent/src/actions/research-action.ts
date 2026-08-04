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
import {
  buildCacheablePrompt,
  hashParts,
  promptCacheMetrics,
} from "@/runtime/prompt-cache";

const RESEARCH_PREFIX = "/research";
const RESEARCH_PROMPT_VERSION = "doolittle-research-action-v1";
const RESEARCH_PROMPT_CONTRACT = [
  "Produce a rigorous research report for the user.",
  "Use current sources, cite every material factual claim, distinguish sourced facts from inference, and state important limitations.",
  "Answer the research question directly before adding supporting detail.",
].join("\n");

export interface DoolittleResearchSource {
  title: string;
  url: string;
}

export interface DoolittleResearchRun {
  report: string;
  sources: DoolittleResearchSource[];
  responseId?: string;
}

export interface DoolittleResearchActionData {
  actionName: "DOOLITTLE_RESEARCH";
  responseId?: string;
  sources: DoolittleResearchSource[];
}

export type DoolittleResearchRuntime = Pick<
  IAgentRuntime,
  "getModel" | "useModel"
>;

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

function resolveResearchQuestion(
  message: Memory,
  options: HandlerOptions | undefined,
): string | undefined {
  const parameters =
    options?.parameters && typeof options.parameters === "object"
      ? (options.parameters as Record<string, unknown>)
      : undefined;
  const parameterQuestion = parameters?.question;
  if (typeof parameterQuestion === "string" && parameterQuestion.trim()) {
    return parameterQuestion.trim();
  }
  const shortcutQuestion =
    options && typeof options === "object"
      ? (options as Record<string, unknown>).question
      : undefined;
  if (typeof shortcutQuestion === "string" && shortcutQuestion.trim()) {
    return shortcutQuestion.trim();
  }
  return parseResearchQuestion(messageText(message));
}

function sourcesFromAnnotations(
  annotations: ResearchAnnotation[],
): DoolittleResearchSource[] {
  const seen = new Set<string>();
  const sources: DoolittleResearchSource[] = [];
  for (const annotation of annotations) {
    if (!annotation.url || seen.has(annotation.url)) {
      continue;
    }
    seen.add(annotation.url);
    sources.push({
      title: annotation.title || annotation.url,
      url: annotation.url,
    });
  }
  return sources;
}

function renderSources(sources: DoolittleResearchSource[]): string {
  const lines = sources.map((source) => `- ${source.title} (${source.url})`);
  return lines.length > 0 ? `\n\nSources:\n${lines.join("\n")}` : "";
}

function buildResearchInput(question: string, conversationId?: string): string {
  // ModelType.RESEARCH accepts structured ResearchParams rather than the
  // promptSegments/providerOptions used by text-generation models. Route the
  // prompt through the shared abstraction with the transport id `research` so
  // the stable/volatile contract and observability remain authoritative
  // without falsely claiming that provider cache hints were emitted.
  const prompt = buildCacheablePrompt({
    stableBlocks: [RESEARCH_PROMPT_CONTRACT],
    volatile: `Research question:\n${question}`,
    joiner: "\n\n",
    provider: "research",
    model: "model-type:research",
    versionDigest: hashParts([RESEARCH_PROMPT_VERSION]),
    conversationId,
  });
  promptCacheMetrics.recordPlan(prompt.stats);
  return prompt.prompt;
}

/**
 * Executes Doolittle's single research contract for both user actions and
 * durable orchestrator tasks. Callers retain responsibility for presenting or
 * recording failures in their own interaction model.
 */
export async function runDoolittleResearch(
  runtime: DoolittleResearchRuntime,
  question: string,
  conversationId?: string,
): Promise<DoolittleResearchRun> {
  if (!runtime.getModel(ModelType.RESEARCH)) {
    throw new Error(
      "Deep research is unavailable: no RESEARCH model is registered. Set OPENAI_API_KEY and enable the OpenAI provider to use deep research.",
    );
  }

  const result = await runtime.useModel(ModelType.RESEARCH, {
    input: buildResearchInput(question, conversationId),
    tools: [{ type: "web_search_preview" }],
  });
  const sources = sourcesFromAnnotations(result.annotations ?? []);
  return {
    report: `${result.text}${renderSources(sources)}`,
    sources,
    responseId: result.id,
  };
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
      "Runs the ElizaOS deep-research model (ModelType.RESEARCH, e.g. o3-deep-research) over a question with web search and returns a cited report. Use for detailed research requests that need sourced, current evidence. Requires a registered RESEARCH model; deep research can take several minutes.",
    descriptionCompressed: "Run sourced deep research over a question.",
    routingHint:
      "detailed sourced research request -> DOOLITTLE_RESEARCH; quick current lookup -> WEB_SEARCH",
    contexts: ["research", "browser"],
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const question = resolveResearchQuestion(message, options);
      if (!question) {
        const usage = "Usage: /research <a detailed question>";
        await callback?.({ text: usage, source: "research-action" });
        return { success: false, text: usage, userFacingText: usage };
      }

      try {
        const research = await runDoolittleResearch(
          runtime,
          question,
          message.roomId,
        );
        const report = research.report;
        await callback?.({ text: report, source: "research-action" });
        return {
          success: true,
          text: report,
          userFacingText: report,
          verifiedUserFacing: true,
          data: {
            actionName: "DOOLITTLE_RESEARCH",
            responseId: research.responseId,
            sources: research.sources,
          } satisfies DoolittleResearchActionData,
        };
      } catch (error) {
        const failure = `Deep research failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
        await callback?.({ text: failure, source: "research-action" });
        return { success: false, text: failure, userFacingText: failure };
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
    parameters: [
      {
        name: "question",
        description: "Detailed research question to investigate.",
        required: true,
        schema: { type: "string", minLength: 1 },
      },
    ],
  };
}
