import {
  buildMediaSpeechManifest,
  buildMediaSpeechPrompt,
  buildMediaSpeechReport,
} from "../formatters/generation";
import { buildMediaSpeechPaths, slugifyMediaText } from "../paths";
import { requestSpeechGeneration } from "./speech";
import type { MediaSpeechGenerationInput, MediaSpeechResult } from "./types";
import { writeMediaManifestFile, writeMediaTextFile } from "./write-helpers";

export async function generateMediaSpeechArtifact(
  input: MediaSpeechGenerationInput,
): Promise<MediaSpeechResult> {
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

  writeMediaTextFile(
    promptPath,
    buildMediaSpeechPrompt(
      input.text,
      voice,
      options.speed,
      modelContext?.provider,
      modelContext?.model,
    ),
  );
  writeMediaManifestFile(
    manifestPath,
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
  );
  writeMediaTextFile(
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
  );
  writeMediaTextFile(responsePath, generation.response);

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
