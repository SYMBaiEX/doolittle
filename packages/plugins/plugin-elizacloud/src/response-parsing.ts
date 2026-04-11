import {
  ELIZA_CLOUD_EMPTY_RESPONSE_MODEL_PREFIXES,
  ELIZA_CLOUD_RESPONSES_MODEL_MARKERS,
} from "./constants";

export function extractTextFromChatCompletions(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const parsed = payload as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };

  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => entry.text ?? "")
      .join("")
      .trim();
  }
  return "";
}

export function extractTextFromResponsesApi(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const parsed = payload as {
    output_text?: string;
    output?: Array<{
      type?: string;
      text?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  if (typeof parsed.output_text === "string" && parsed.output_text.trim()) {
    return parsed.output_text.trim();
  }

  if (!Array.isArray(parsed.output)) {
    return "";
  }

  return parsed.output
    .flatMap((entry) => {
      if (typeof entry.text === "string" && entry.text.trim()) {
        return [entry.text.trim()];
      }
      if (!Array.isArray(entry.content)) {
        return [];
      }
      return entry.content
        .map((content) =>
          typeof content.text === "string" ? content.text.trim() : "",
        )
        .filter(Boolean);
    })
    .join("\n")
    .trim();
}

export function shouldUseResponsesApi(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return ELIZA_CLOUD_RESPONSES_MODEL_MARKERS.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

export function shouldRetryEmptyCloudResponse(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return ELIZA_CLOUD_EMPTY_RESPONSE_MODEL_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

export function extractEmbeddingInput(
  params:
    | {
        text?: string | undefined;
        input?: string | undefined;
      }
    | string
    | null,
): string {
  if (typeof params === "string" && params.trim()) {
    return params.trim();
  }
  if (params && typeof params === "object") {
    const candidate =
      (typeof params.text === "string" ? params.text : "") ||
      (typeof params.input === "string" ? params.input : "");
    if (candidate.trim()) {
      return candidate.trim();
    }
  }
  return "embedding dimension probe";
}

export function extractEmbeddingVector(payload: unknown): number[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const parsed = payload as {
    data?: Array<{
      embedding?: number[];
    }>;
  };

  const vector = parsed.data?.[0]?.embedding;
  return Array.isArray(vector) ? vector : [];
}
