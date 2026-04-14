import { mkdirSync } from "node:fs";
import { buildMediaTranscriptionPrompt } from "../formatters/transcription";
import { buildMediaTranscriptionPaths, slugifyMediaText } from "../paths";
import type {
  ExecuteMediaTranscriptionInput,
  PreparedMediaTranscription,
} from "./types";

export function prepareMediaTranscription(
  input: ExecuteMediaTranscriptionInput,
): PreparedMediaTranscription {
  const options = input.options ?? {};
  const modelContext = input.modelContext;

  mkdirSync(input.outputDir, { recursive: true });

  const inspection = input.dependencies.inspect(input.path);
  const bundle = input.dependencies.bundle(input.path);
  const stamp = Date.now();
  const label = slugifyMediaText(
    options.name ??
      `${inspection.basename}-${inspection.contentHash ?? "transcript"}`,
  );
  const paths = buildMediaTranscriptionPaths(input.outputDir, stamp, label);
  const signals = input.dependencies.buildSignals(inspection);
  const prompt = buildMediaTranscriptionPrompt(inspection, signals);

  return {
    outputDir: input.outputDir,
    path: input.path,
    options,
    modelContext,
    dependencies: input.dependencies,
    inspection,
    bundle,
    signals,
    prompt,
    paths,
  };
}
