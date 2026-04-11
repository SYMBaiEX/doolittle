interface CodexEventPayload {
  type?: string;
  delta?: string;
  text?: string;
  output_text?: string;
  response?: {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  item?: {
    content?: Array<{ type?: string; text?: string }>;
  };
}

export function extractCodexEventText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const event = payload as CodexEventPayload;

  if (typeof event.delta === "string" && event.delta.trim()) {
    return event.delta;
  }

  if (typeof event.text === "string" && event.text.trim()) {
    return event.text;
  }

  if (typeof event.output_text === "string" && event.output_text.trim()) {
    return event.output_text;
  }

  const responseText =
    event.response?.output_text?.trim() ||
    event.response?.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" || item.type === "text")
      .map((item) => item.text ?? "")
      .join("")
      .trim();
  if (responseText) {
    return responseText;
  }

  const itemText = event.item?.content
    ?.filter((item) => item.type === "output_text" || item.type === "text")
    .map((item) => item.text ?? "")
    .join("")
    .trim();
  return itemText || "";
}

export function mergeCodexOutput(current: string, next: string): string {
  if (!next.trim()) {
    return current;
  }
  if (!current.trim()) {
    return next;
  }
  if (current === next || current.endsWith(next)) {
    return current;
  }
  if (next.includes(current)) {
    return next;
  }
  return current + next;
}

export function extractCodexTextFromEventStream(raw: string): string {
  const normalized = raw.replace(/\r\n/g, "\n");
  const events = normalized.split("\n\n");
  let output = "";

  for (const rawEvent of events) {
    const dataLines = rawEvent
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s?/, "").trim())
      .filter(Boolean);

    for (const line of dataLines) {
      if (line === "[DONE]") {
        continue;
      }
      try {
        output = mergeCodexOutput(
          output,
          extractCodexEventText(JSON.parse(line)),
        );
      } catch {
        output = mergeCodexOutput(output, line);
      }
    }
  }

  return output.trim();
}

export async function readCodexResponseText(
  response: Response,
): Promise<string> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const raw = await response.text();
    try {
      const data = JSON.parse(raw) as {
        output_text?: string;
        output?: Array<{
          type?: string;
          content?: Array<{ type?: string; text?: string }>;
        }>;
      };

      const directText = data.output_text?.trim();
      if (directText) {
        return directText;
      }

      const contentText = data.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === "output_text" || item.type === "text")
        .map((item) => item.text ?? "")
        .join("")
        .trim();

      return contentText || raw.trim() || "No response returned.";
    } catch {
      const streamed = raw.includes("data:")
        ? extractCodexTextFromEventStream(raw)
        : "";
      return streamed || raw.trim() || "No response returned.";
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return "No response returned.";
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      output = mergeCodexOutput(
        output,
        extractCodexTextFromEventStream(rawEvent),
      );

      boundary = buffer.indexOf("\n\n");
    }
  }

  const trailing = buffer.trim();
  if (trailing.startsWith("data:")) {
    const line = trailing.replace(/^data:\s?/, "").trim();
    if (line && line !== "[DONE]") {
      try {
        output = mergeCodexOutput(
          output,
          extractCodexEventText(JSON.parse(line)),
        );
      } catch {
        output = mergeCodexOutput(output, line);
      }
    }
  }

  return output.trim() || "No response returned.";
}
