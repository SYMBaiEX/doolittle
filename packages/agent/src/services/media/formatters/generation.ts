import { joinMediaLines } from "./utils";

export function buildMediaImagePrompt(
  prompt: string,
  refinedPrompt: string,
  options: {
    style?: string;
    focus?: string;
  } = {},
): string {
  return joinMediaLines([
    `# Image Prompt`,
    "",
    `Original prompt: ${prompt}`,
    options.style ? `Style: ${options.style}` : undefined,
    options.focus ? `Focus: ${options.focus}` : undefined,
    "",
    "## Refined Prompt",
    refinedPrompt,
  ]);
}

export function buildMediaImageManifest(
  createdAt: string,
  prompt: string,
  refinedPrompt: string,
  options: {
    name?: string;
    size?: string;
    style?: string;
    focus?: string;
  },
  provider: string,
  model: string,
  artifactPath: string,
  artifactKind: "png" | "svg",
  responsePath?: string,
): {
  createdAt: string;
  prompt: string;
  refinedPrompt: string;
  options: {
    name?: string;
    size?: string;
    style?: string;
    focus?: string;
  };
  provider: string;
  model: string;
  artifactPath: string;
  artifactKind: "png" | "svg";
  responsePath?: string;
} {
  return {
    createdAt,
    prompt,
    refinedPrompt,
    options,
    provider,
    model,
    artifactPath,
    artifactKind,
    responsePath,
  };
}

export function buildMediaImageReport(
  prompt: string,
  refinedPrompt: string,
  response: string | undefined,
  provider: string,
  model: string,
  artifactPath: string,
  artifactKind: "png" | "svg",
): string {
  return [
    `# Image Generation`,
    "",
    `- Provider: ${provider}`,
    `- Model: ${model}`,
    `- Artifact: ${artifactPath}`,
    `- Kind: ${artifactKind}`,
    "",
    "## Original Prompt",
    prompt,
    "",
    "## Refined Prompt",
    refinedPrompt,
    "",
    response ? "## Model Response" : "## Mode",
    response ?? "Generated locally as an SVG concept artifact.",
  ].join("\n");
}

export function buildMediaSpeechPrompt(
  text: string,
  voice: string,
  speed?: number,
  provider?: string,
  model?: string,
): string {
  return joinMediaLines([
    `# Speech Prompt`,
    "",
    `Provider: ${provider ?? "offline"}`,
    `Model: ${model ?? "offline"}`,
    `Voice: ${voice}`,
    speed ? `Speed: ${speed}` : undefined,
    "",
    text,
  ]);
}

export function buildMediaSpeechManifest(
  createdAt: string,
  prompt: string,
  refinedText: string,
  script: string,
  voice: string,
  speed: number | undefined,
  provider: string,
  model: string,
  artifactPath: string,
  artifactKind: "mp3" | "svg",
  responsePath: string,
): {
  createdAt: string;
  prompt: string;
  refinedText: string;
  script: string;
  voice: string;
  speed: number | undefined;
  provider: string;
  model: string;
  artifactPath: string;
  artifactKind: "mp3" | "svg";
  responsePath: string;
} {
  return {
    createdAt,
    prompt,
    refinedText,
    script,
    voice,
    speed,
    provider,
    model,
    artifactPath,
    artifactKind,
    responsePath,
  };
}

export function buildMediaSpeechReport(
  text: string,
  script: string,
  response: string,
  provider: string,
  model: string,
  voice: string,
  artifactPath: string,
  artifactKind: "mp3" | "svg",
): string {
  return [
    `# Speech Generation`,
    "",
    `- Provider: ${provider}`,
    `- Model: ${model}`,
    `- Voice: ${voice}`,
    `- Artifact: ${artifactPath}`,
    `- Kind: ${artifactKind}`,
    "",
    "## Source Text",
    text,
    "",
    "## Refined Narration",
    script,
    "",
    "## Response",
    response,
  ].join("\n");
}
