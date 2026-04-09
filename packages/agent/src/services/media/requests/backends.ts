import type { MediaModelContext, MediaTextRequestMetadata } from "../types";

export function buildOfflineMediaTextResponse(
  prompt: string,
  metadata: MediaTextRequestMetadata,
): string {
  return [
    `Offline analysis for ${metadata.focus}.`,
    metadata.inspection ? `Kind: ${metadata.inspection.kind}` : undefined,
    metadata.inspection?.textPreview
      ? `Preview: ${metadata.inspection.textPreview}`
      : undefined,
    metadata.inspection?.transcriptPreview
      ? `Transcript: ${metadata.inspection.transcriptPreview}`
      : undefined,
    metadata.inspection?.captionPreview
      ? `Caption: ${metadata.inspection.captionPreview}`
      : undefined,
    ...(metadata.signals?.length
      ? [`Signals: ${metadata.signals.join("; ")}`]
      : []),
    "",
    prompt.slice(0, 1200),
  ]
    .filter(Boolean)
    .join("\n");
}

export function chooseMediaTextBackend(
  context: MediaModelContext | undefined,
): "offline" | "anthropic" | "openai" {
  const canUseOpenAi = Boolean(context?.openAiApiKey);
  const canUseAnthropic = Boolean(context?.anthropicApiKey);

  if (
    !context ||
    context.provider === "offline" ||
    (!canUseOpenAi && !canUseAnthropic)
  ) {
    return "offline";
  }

  if (
    (context.provider === "anthropic" && canUseAnthropic) ||
    (!canUseOpenAi && canUseAnthropic)
  ) {
    return "anthropic";
  }

  return canUseOpenAi ? "openai" : "offline";
}

export async function requestMediaModelText(
  prompt: string,
  context: MediaModelContext | undefined,
  metadata: MediaTextRequestMetadata,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const backend = chooseMediaTextBackend(context);

  if (backend === "offline") {
    return buildOfflineMediaTextResponse(prompt, metadata);
  }

  if (backend === "anthropic") {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    };
    if (context?.anthropicApiKey) {
      headers["x-api-key"] = context.anthropicApiKey;
    }
    const response = await fetchImpl(
      `${context?.anthropicBaseUrl ?? context?.baseUrl}/messages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: context?.model,
          max_tokens: context?.maxTokens,
          temperature: context?.temperature,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };
    return (
      data.content
        ?.map((entry) => entry.text ?? "")
        .join("")
        .trim() || "No response returned."
    );
  }

  if (!context?.openAiApiKey) {
    return buildOfflineMediaTextResponse(prompt, metadata);
  }

  const response = await fetchImpl(`${context.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${context.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: context.model,
      temperature: context.temperature,
      max_tokens: context.maxTokens,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OpenAI-compatible request failed (${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content?.trim() ?? "No response returned.";
}
