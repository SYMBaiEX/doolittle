import {
  getRuntimeModelSettings,
  getRuntimeProvider,
  normalizeProviderTransportError,
  ProviderTransportError,
  resolveModelPromptText,
} from "@doolittle/provider-transport";
import type { GenerateTextParams, IAgentRuntime } from "@elizaos/core";
import { invokeClaudeCodeCliPrint, withClaudeCodeSystemPrefix } from "./cli";
import type { ClaudeCodePluginOptions } from "./types";

const CLAUDE_REASONING_EFFORTS = new Set([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

function resolveClaudeReasoningEffort(
  value: string | undefined,
): string | undefined {
  const effort = value?.trim();
  return effort && CLAUDE_REASONING_EFFORTS.has(effort) ? effort : undefined;
}

function resolveClaudeCliModel(model: string): string {
  const normalized = model.trim().toLowerCase();
  if (normalized.includes("sonnet")) return "sonnet";
  if (normalized.includes("opus")) return "opus";
  if (normalized.includes("haiku")) return "haiku";
  return model;
}

/**
 * Narrow product fallback for the one contract the pinned official Anthropic
 * plugin does not yet expose: schema-constrained Claude CLI inference. Native
 * OAuth, account rotation, messages, tools, and streaming stay upstream-owned.
 */
export async function runClaudeCodeTextGeneration(
  runtime: IAgentRuntime,
  params: GenerateTextParams,
  options: ClaudeCodePluginOptions,
): Promise<string> {
  const provider = getRuntimeProvider(runtime);
  if (provider && provider !== "claude-code") {
    throw new ProviderTransportError(
      `Claude Code CLI fallback is active, but runtime provider is ${provider}.`,
      {
        code: "incompatible_provider",
        provider: "claude-code",
        detail: provider,
      },
    );
  }

  if (!options.allowCliFallback) {
    throw new ProviderTransportError(
      "Claude Code CLI fallback is disabled. Linked OAuth execution is owned by the official Eliza Anthropic plugin.",
      {
        code: "no_credentials",
        provider: "claude-code",
      },
    );
  }

  const runtimeModel = getRuntimeModelSettings(runtime);
  const model = runtimeModel.model || "claude-sonnet-4.6";
  const effort = resolveClaudeReasoningEffort(runtimeModel.reasoningEffort);
  const requiredSingleTool =
    params.toolChoice !== "none" && params.tools?.length === 1
      ? params.tools[0]
      : undefined;

  try {
    const output = await (options.invokeCliPrint ?? invokeClaudeCodeCliPrint)({
      prompt: resolveModelPromptText(params),
      model: resolveClaudeCliModel(model),
      systemPrompt: withClaudeCodeSystemPrefix(),
      ...(effort ? { effort } : {}),
      ...(requiredSingleTool?.parameters
        ? {
            jsonSchema: requiredSingleTool.parameters as Record<
              string,
              unknown
            >,
          }
        : {}),
    });
    return output || "No response returned.";
  } catch (error) {
    throw normalizeProviderTransportError("claude-code", "CLI request", error);
  }
}
