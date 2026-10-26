import type { ChatMessage } from "@elizaos/core";
import { fileTypeFromBuffer } from "file-type";
import type {
  ResponseInput,
  ResponseInputContent,
} from "openai/resources/responses/responses";

type ContentPart = { type: string; [key: string]: unknown };
function contentParts(content: ChatMessage["content"]): ContentPart[] {
  return Array.isArray(content) ? (content as ContentPart[]) : [];
}

const imageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
export function codexMessageText(content: ChatMessage["content"]): string {
  return typeof content === "string"
    ? content
    : contentParts(content)
        .filter((part) => part.type === "text")
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("\n");
}
function toolOutputText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value
      .flatMap((part) =>
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof part.text === "string"
          ? [part.text]
          : [],
      )
      .join("\n");
  if (typeof value === "object") {
    if ("value" in value && typeof value.value === "string") return value.value;
    if ("text" in value && typeof value.text === "string") return value.text;
    return JSON.stringify(value);
  }
  return String(value);
}

async function imageUrl(part: ContentPart): Promise<string> {
  const invalid = () => new Error("Unsupported Codex image input.");
  if (part.type !== "image") throw invalid();
  if (part.mediaType !== undefined && typeof part.mediaType !== "string")
    throw invalid();
  const declared =
    typeof part.mediaType === "string"
      ? part.mediaType.toLowerCase()
      : undefined;
  if (declared && !imageTypes.has(declared)) throw invalid();
  const value = part.image instanceof URL ? part.image.href : part.image;
  let bytes: Uint8Array;
  if (value instanceof Uint8Array) bytes = value;
  else if (typeof value === "string") {
    if (/^https?:/iu.test(value)) {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw invalid();
      }
      if (url.username || url.password) throw invalid();
      return url.href;
    }
    const match =
      /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/iu.exec(
        value,
      );
    const base64 = match?.[2] ?? (declared ? value : "");
    if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(base64)) throw invalid();
    bytes = Buffer.from(base64, "base64");
    if (
      Buffer.from(bytes).toString("base64").replace(/=+$/u, "") !==
      base64.replace(/=+$/u, "")
    )
      throw invalid();
    if (match && declared && declared !== match[1].toLowerCase())
      throw invalid();
  } else throw invalid();
  const detected = await fileTypeFromBuffer(bytes).catch(() => undefined);
  if (
    !detected ||
    !imageTypes.has(detected.mime) ||
    (declared && declared !== detected.mime)
  )
    throw invalid();
  return `data:${detected.mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

/** Translate the public Eliza message contract to official Responses input. */
export async function codexResponsesInput(
  messages: ChatMessage[] = [],
  prompt = "",
): Promise<ResponseInput> {
  const input: ResponseInput = [];
  const pending: string[] = [];
  let lastText = "";
  for (const message of messages) {
    const parts = contentParts(message.content);
    if (parts.some((part) => part.type === "image") && message.role !== "user")
      throw new Error("Codex image input requires a user message.");
    if (message.role === "system" || message.role === "developer") continue;
    if (message.role === "tool") {
      const results = parts.filter((part) => part.type === "tool-result");
      const outputs = results.length
        ? results.map((part) => ({
            id:
              typeof part.toolCallId === "string"
                ? part.toolCallId
                : message.toolCallId,
            text: toolOutputText(part.output ?? part.result),
          }))
        : [{ id: message.toolCallId, text: codexMessageText(message.content) }];
      for (const output of outputs) {
        const index = output.id ? pending.indexOf(output.id) : 0;
        const id = pending.splice(Math.max(index, 0), 1)[0];
        if (id)
          input.push({
            type: "function_call_output",
            call_id: id,
            output: output.text,
          });
        else if (output.text)
          input.push({ role: "user", content: output.text });
      }
      continue;
    }
    lastText = codexMessageText(message.content);
    if (message.role === "assistant") {
      if (lastText) input.push({ role: "assistant", content: lastText });
      const calls = [
        ...(message.toolCalls ?? []),
        ...parts
          .filter((part) => part.type === "tool-call")
          .map((part) => ({
            id: String(part.toolCallId ?? part.id ?? ""),
            name: String(part.toolName ?? part.name ?? ""),
            arguments: part.input ?? part.args ?? part.arguments ?? {},
          })),
      ];
      const seen = new Set<string>();
      for (const call of calls) {
        if (!call.id || seen.has(call.id)) continue;
        seen.add(call.id);
        pending.push(call.id);
        input.push({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          arguments:
            typeof call.arguments === "string"
              ? call.arguments
              : JSON.stringify(call.arguments),
        });
      }
    } else {
      const content: ResponseInputContent[] = parts.length
        ? await Promise.all(
            parts
              .filter((part) => part.type === "text" || part.type === "image")
              .map(
                async (part): Promise<ResponseInputContent> =>
                  part.type === "image"
                    ? {
                        type: "input_image",
                        image_url: await imageUrl(part),
                        detail: "auto",
                      }
                    : {
                        type: "input_text",
                        text: typeof part.text === "string" ? part.text : "",
                      },
              ),
          )
        : [{ type: "input_text", text: lastText }];
      input.push({ role: "user", content });
    }
  }
  if (prompt.trim() && prompt !== lastText)
    input.push({ role: "user", content: prompt });
  return input;
}
