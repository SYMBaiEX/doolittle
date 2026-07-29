import {
  type ChatMessage,
  type ChatMessageContentPart,
  type GenerateTextParams,
  type IAgentRuntime,
  ModelType,
  renderChatMessagesForPrompt,
  type TextGenerationModelType,
  type ToolDefinition,
} from "@elizaos/core";

/**
 * The complete text-generation surface currently defined by ElizaOS.
 *
 * Provider plugins and Doolittle's dynamic provider selector share this one
 * list so a new SDK model class cannot be registered by one layer while being
 * silently ignored by another.
 */
export const ELIZA_TEXT_GENERATION_MODEL_TYPES = [
  ModelType.TEXT_NANO,
  ModelType.TEXT_SMALL,
  ModelType.TEXT_MEDIUM,
  ModelType.TEXT_LARGE,
  ModelType.TEXT_MEGA,
  ModelType.RESPONSE_HANDLER,
  ModelType.ACTION_PLANNER,
  ModelType.TEXT_REASONING_SMALL,
  ModelType.TEXT_REASONING_LARGE,
  ModelType.TEXT_COMPLETION,
] as const satisfies readonly TextGenerationModelType[];

const ELIZA_TEXT_GENERATION_MODEL_TYPE_SET = new Set<string>(
  ELIZA_TEXT_GENERATION_MODEL_TYPES,
);

export function isElizaTextGenerationModelType(
  modelType: unknown,
): modelType is TextGenerationModelType {
  return ELIZA_TEXT_GENERATION_MODEL_TYPE_SET.has(String(modelType));
}

export type ElizaTextGenerationHandler = (
  runtime: IAgentRuntime,
  params: GenerateTextParams,
  modelType: TextGenerationModelType,
) => Promise<string>;

export type ElizaTextGenerationModelHandlers = {
  [K in TextGenerationModelType]: (
    runtime: IAgentRuntime,
    params: GenerateTextParams,
  ) => Promise<string>;
};

/**
 * Register one provider implementation across Eliza's full text model surface.
 *
 * The selected model type is forwarded to providers that need tier-specific
 * behavior; providers with one transport can ignore it.
 */
export function createElizaTextGenerationModelHandlers(
  handler: ElizaTextGenerationHandler,
): ElizaTextGenerationModelHandlers {
  return Object.fromEntries(
    ELIZA_TEXT_GENERATION_MODEL_TYPES.map((modelType) => [
      modelType,
      (runtime: IAgentRuntime, params: GenerateTextParams) =>
        handler(runtime, params, modelType),
    ]),
  ) as ElizaTextGenerationModelHandlers;
}

/**
 * Resolve the current Eliza model-input contract for a prompt-only transport.
 *
 * Native providers should consume `messages`, `attachments`, and `tools`
 * directly. This adapter is intentionally the one compatibility boundary for
 * linked-account CLIs and APIs that can only receive text.
 */
export function resolveModelPromptText(params: GenerateTextParams): string {
  if (params.prompt !== undefined && params.prompt.length > 0) {
    return params.prompt;
  }

  const input =
    promptSegmentsText(params) ||
    renderChatMessagesForPrompt(transportMessages(params.messages)) ||
    "";
  return appendToolContract(input, params.tools ?? [], params.toolChoice);
}

function promptSegmentsText(params: GenerateTextParams): string {
  return (params.promptSegments ?? [])
    .map((segment) => segment.content)
    .join("");
}

function transportMessages(
  messages: ChatMessage[] | undefined,
): ChatMessage[] | undefined {
  return messages?.map((message) => {
    const content = messageContentText(message.content);
    const toolCalls = message.toolCalls?.length
      ? `Tool calls: ${JSON.stringify(message.toolCalls)}`
      : "";
    return {
      ...message,
      content: [content, toolCalls].filter(Boolean).join("\n"),
    };
  });
}

function messageContentText(content: ChatMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map(contentPartText).filter(Boolean).join("\n");
}

function contentPartText(part: ChatMessageContentPart): string {
  if (part.type === "text" && typeof part.text === "string") {
    return part.text;
  }
  if (part.type === "image") {
    return "[image attachment]";
  }
  if (part.type === "file") {
    return part.filename
      ? `[file attachment: ${part.filename}]`
      : "[file attachment]";
  }

  const text = "text" in part ? part.text : undefined;
  return typeof text === "string" ? text : JSON.stringify(part);
}

function appendToolContract(
  input: string,
  tools: ToolDefinition[],
  toolChoice: GenerateTextParams["toolChoice"],
): string {
  if (tools.length === 0 || toolChoice === undefined || toolChoice === "none") {
    return input;
  }

  const selection =
    toolChoice === "required"
      ? "A tool response is required."
      : `Tool choice: ${JSON.stringify(toolChoice)}.`;
  const outputRule =
    tools.length === 1
      ? `Return only the JSON arguments for ${tools[0]?.name}; do not wrap them in a tool-call envelope or Markdown.`
      : 'Return only JSON in the form {"toolCalls":[{"name":"TOOL_NAME","args":{...}}]}; do not use Markdown.';

  return [
    input,
    "",
    "TEXT-TRANSPORT TOOL CONTRACT:",
    selection,
    outputRule,
    `Available tools: ${JSON.stringify(tools)}`,
  ].join("\n");
}
