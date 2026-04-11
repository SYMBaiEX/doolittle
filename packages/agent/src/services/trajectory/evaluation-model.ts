import type {
  TrajectoryModelContext,
  TrajectoryReplayResult,
} from "../../types/trajectory";

export type { TrajectoryModelContext } from "../../types/trajectory";

export async function requestTrajectoryModelText(
  prompt: string,
  context: TrajectoryModelContext | undefined,
  metadata: {
    focus: string;
    replay?: TrajectoryReplayResult;
    score?: number;
    findings?: string[];
    recommendations?: string[];
  },
): Promise<string> {
  const canUseOpenAi = Boolean(context?.openAiApiKey);
  const canUseAnthropic = Boolean(context?.anthropicApiKey);

  if (
    !context ||
    context.provider === "offline" ||
    (!canUseOpenAi && !canUseAnthropic)
  ) {
    return [
      `Offline trajectory analysis for ${metadata.focus}.`,
      metadata.replay ? `Messages: ${metadata.replay.messageCount}` : undefined,
      typeof metadata.score === "number"
        ? `Score: ${metadata.score}`
        : undefined,
      metadata.findings?.length
        ? `Findings: ${metadata.findings.join("; ")}`
        : undefined,
      metadata.recommendations?.length
        ? `Recommendations: ${metadata.recommendations.join("; ")}`
        : undefined,
      "",
      prompt.slice(0, 1600),
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (
    (context.provider === "anthropic" && canUseAnthropic) ||
    (!canUseOpenAi && canUseAnthropic)
  ) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    };
    if (context.anthropicApiKey) {
      headers["x-api-key"] = context.anthropicApiKey;
    }
    const response = await fetch(
      `${context.anthropicBaseUrl ?? context.baseUrl}/messages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: context.model,
          max_tokens: context.maxTokens,
          temperature: context.temperature,
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

  if (!canUseOpenAi) {
    return prompt.slice(0, 1600);
  }

  const response = await fetch(`${context.baseUrl}/chat/completions`, {
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
