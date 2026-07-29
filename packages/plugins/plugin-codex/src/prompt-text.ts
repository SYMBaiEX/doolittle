import type {
  ChatMessage,
  ChatMessageContentPart,
  GenerateTextParams,
  ToolDefinition,
} from "@elizaos/core";

/**
 * Convert the current Eliza chat-native model contract into the text transport
 * used by linked-account CLIs and prompt-only provider APIs.
 */
export function resolveModelPromptText(params: GenerateTextParams): string {
  if (params.prompt !== undefined && params.prompt.length > 0) {
    return params.prompt;
  }

  const input =
    promptSegmentsText(params) || messagesText(params.messages ?? []);
  return appendToolContract(input, params.tools ?? [], params.toolChoice);
}

function promptSegmentsText(params: GenerateTextParams): string {
  return (params.promptSegments ?? [])
    .map((segment) => segment.content)
    .join("");
}

function messagesText(messages: ChatMessage[]): string {
  return messages
    .map((message) => {
      const content = messageContentText(message.content);
      if (!content && !message.toolCalls?.length) {
        return "";
      }

      const toolCalls = message.toolCalls?.length
        ? `\nTool calls: ${JSON.stringify(message.toolCalls)}`
        : "";
      return `${message.role.toUpperCase()}:\n${content}${toolCalls}`;
    })
    .filter(Boolean)
    .join("\n\n");
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
