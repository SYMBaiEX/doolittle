import { writeFileSync } from "node:fs";
import {
  buildMediaImageManifest,
  buildMediaImagePrompt,
  buildMediaImageReport,
  buildMediaSpeechManifest,
  buildMediaSpeechPrompt,
  buildMediaSpeechReport,
} from "../formatters/generation";
import {
  buildMediaGenerationPaths,
  buildMediaSpeechPaths,
  slugifyMediaText,
} from "../paths";
import type {
  MediaGenerationOptions,
  MediaGenerationBundle as MediaGenerationResult,
  MediaModelContext,
  MediaSpeechOptions,
  MediaSpeechBundle as MediaSpeechResult,
} from "../types";
import { requestImageGeneration } from "./image";
import { requestSpeechGeneration } from "./speech";

interface MediaImageGenerationDependencies {
  requestModelText: (
    prompt: string,
    context: MediaModelContext | undefined,
    metadata: { focus: string },
  ) => Promise<string>;
}

interface MediaSpeechGenerationDependencies {
  requestModelText: (
    prompt: string,
    context: MediaModelContext | undefined,
    metadata: { focus: string },
  ) => Promise<string>;
}

export async function generateMediaImageArtifact(input: {
  outputDir: string;
  prompt: string;
  options?: MediaGenerationOptions;
  modelContext?: MediaModelContext;
  dependencies: MediaImageGenerationDependencies;
}): Promise<MediaGenerationResult> {
  const options = input.options ?? {};
  const modelContext = input.modelContext;
  const stamp = Date.now();
  const label = slugifyMediaText(options.name ?? input.prompt);
  const {
    promptPath,
    manifestPath,
    reportPath,
    artifactPath: fallbackArtifactPath,
  } = buildMediaGenerationPaths(input.outputDir, stamp, label);
  const refinedPrompt = await input.dependencies.requestModelText(
    [
      "Create a concise image-generation brief for Doolittle.",
      "Return a compact prompt that captures subject, style, composition, and palette.",
      `Source prompt: ${input.prompt}`,
      options.style ? `Style: ${options.style}` : undefined,
      options.focus ? `Focus: ${options.focus}` : undefined,
    ]
      .filter(Boolean)
      .join("\n"),
    modelContext,
    {
      focus: "vision",
    },
  );
  const generation = await requestImageGeneration({
    outputDir: input.outputDir,
    prompt: refinedPrompt || input.prompt,
    context: modelContext,
    size: options.size,
  });
  const artifactPath = generation?.path ?? fallbackArtifactPath;
  const artifactKind = generation?.kind ?? "svg";
  const response = generation?.response;
  const responsePath = generation?.responsePath;

  writeFileSync(
    manifestPath,
    JSON.stringify(
      buildMediaImageManifest(
        new Date().toISOString(),
        input.prompt,
        refinedPrompt || input.prompt,
        options,
        modelContext?.provider ?? "offline",
        modelContext?.openAiImageModel ?? modelContext?.model ?? "offline",
        artifactPath,
        artifactKind,
        responsePath,
      ),
      null,
      2,
    ),
    "utf8",
  );

  writeFileSync(
    promptPath,
    buildMediaImagePrompt(input.prompt, refinedPrompt || input.prompt, options),
    "utf8",
  );

  writeFileSync(
    reportPath,
    buildMediaImageReport(
      input.prompt,
      refinedPrompt || input.prompt,
      response,
      modelContext?.provider ?? "offline",
      modelContext?.openAiImageModel ?? modelContext?.model ?? "offline",
      artifactPath,
      artifactKind,
    ),
    "utf8",
  );

  return {
    prompt: input.prompt,
    refinedPrompt: refinedPrompt || input.prompt,
    promptPath,
    manifestPath,
    reportPath,
    artifactPath,
    artifactKind,
    response,
    responsePath,
    model: modelContext?.openAiImageModel ?? modelContext?.model,
    provider: modelContext?.provider,
  };
}

export async function generateMediaSpeechArtifact(input: {
  outputDir: string;
  text: string;
  options?: MediaSpeechOptions;
  modelContext?: MediaModelContext;
  dependencies: MediaSpeechGenerationDependencies;
}): Promise<MediaSpeechResult> {
  const options = input.options ?? {};
  const modelContext = input.modelContext;
  const stamp = Date.now();
  const label = slugifyMediaText(options.name ?? input.text);
  const {
    promptPath,
    manifestPath,
    reportPath,
    artifactPath: fallbackArtifactPath,
    responsePath,
  } = buildMediaSpeechPaths(input.outputDir, stamp, label);
  const voice = options.voice ?? "alloy";
  let refinedText = input.text;
  try {
    refinedText = await input.dependencies.requestModelText(
      [
        "Rewrite the following text into a concise, speakable Doolittle narration.",
        "Keep the Eliza branding intact and remove unnecessary filler.",
        `Voice: ${voice}`,
        options.speed ? `Speed: ${options.speed}` : undefined,
        "",
        input.text,
      ]
        .filter(Boolean)
        .join("\n"),
      modelContext,
      {
        focus: "voice",
      },
    );
  } catch {
    refinedText = input.text;
  }

  const script = refinedText || input.text;
  const generation = await requestSpeechGeneration({
    outputDir: input.outputDir,
    script,
    voice,
    speed: options.speed,
    preferredFormat: options.format ?? "mp3",
    fallbackArtifactPath,
    context: modelContext,
  });

  writeFileSync(
    promptPath,
    buildMediaSpeechPrompt(
      input.text,
      voice,
      options.speed,
      modelContext?.provider,
      modelContext?.model,
    ),
    "utf8",
  );
  writeFileSync(
    manifestPath,
    JSON.stringify(
      buildMediaSpeechManifest(
        new Date().toISOString(),
        input.text,
        refinedText,
        script,
        voice,
        options.speed,
        modelContext?.provider ?? "offline",
        modelContext?.model ?? "offline",
        generation.artifactPath,
        generation.artifactKind,
        responsePath,
      ),
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    reportPath,
    buildMediaSpeechReport(
      input.text,
      script,
      generation.response,
      modelContext?.provider ?? "offline",
      modelContext?.model ?? "offline",
      voice,
      generation.artifactPath,
      generation.artifactKind,
    ),
    "utf8",
  );
  writeFileSync(responsePath, generation.response, "utf8");

  return {
    prompt: input.text,
    refinedText: script,
    promptPath,
    manifestPath,
    reportPath,
    artifactPath: generation.artifactPath,
    artifactKind: generation.artifactKind,
    response: generation.response,
    responsePath,
    model: modelContext?.model ?? "offline",
    provider: modelContext?.provider ?? "offline",
    voice,
  };
}
