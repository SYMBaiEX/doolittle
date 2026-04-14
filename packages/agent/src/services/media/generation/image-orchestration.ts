import {
  buildMediaImageManifest,
  buildMediaImagePrompt,
  buildMediaImageReport,
} from "../formatters/generation";
import { buildMediaGenerationPaths, slugifyMediaText } from "../paths";
import { requestImageGeneration } from "./image";
import type { MediaGenerationResult, MediaImageGenerationInput } from "./types";
import { writeMediaManifestFile, writeMediaTextFile } from "./write-helpers";

export async function generateMediaImageArtifact(
  input: MediaImageGenerationInput,
): Promise<MediaGenerationResult> {
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

  writeMediaManifestFile(
    manifestPath,
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
  );
  writeMediaTextFile(
    promptPath,
    buildMediaImagePrompt(input.prompt, refinedPrompt || input.prompt, options),
  );
  writeMediaTextFile(
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
