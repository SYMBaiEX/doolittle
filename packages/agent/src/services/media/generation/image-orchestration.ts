import { throwIfMediaAborted } from "../abort";
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
  throwIfMediaAborted(options.signal);
  const artifactOptions = {
    name: options.name,
    size: options.size,
    style: options.style,
    focus: options.focus,
  };
  const modelContext = input.modelContext;
  const stamp = Date.now();
  const label = slugifyMediaText(options.name ?? input.prompt);
  const { promptPath, manifestPath, reportPath } = buildMediaGenerationPaths(
    input.outputDir,
    stamp,
    label,
  );
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
  throwIfMediaAborted(options.signal);

  const generation = await requestImageGeneration({
    outputDir: input.outputDir,
    prompt: refinedPrompt || input.prompt,
    size: options.size,
    generateImage: input.dependencies.generateImage,
    signal: options.signal,
  });
  throwIfMediaAborted(options.signal);

  const artifactPath = generation.path;
  const artifactKind = generation.kind;
  const response = generation.response;
  const responsePath = generation.responsePath;

  writeMediaManifestFile(
    manifestPath,
    buildMediaImageManifest(
      new Date().toISOString(),
      input.prompt,
      refinedPrompt || input.prompt,
      artifactOptions,
      generation.provider,
      generation.model,
      artifactPath,
      artifactKind,
      responsePath,
    ),
  );
  writeMediaTextFile(
    promptPath,
    buildMediaImagePrompt(
      input.prompt,
      refinedPrompt || input.prompt,
      artifactOptions,
    ),
  );
  writeMediaTextFile(
    reportPath,
    buildMediaImageReport(
      input.prompt,
      refinedPrompt || input.prompt,
      response,
      generation.provider,
      generation.model,
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
    model: generation.model,
    provider: generation.provider,
  };
}
