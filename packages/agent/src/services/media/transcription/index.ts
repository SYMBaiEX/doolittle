import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  buildMediaTranscriptionManifest,
  buildMediaTranscriptionPrompt,
  buildMediaTranscriptionReport,
} from "../formatters/transcription";
import { buildMediaTranscriptionPaths, slugifyMediaText } from "../paths";
import type {
  MediaBundle,
  MediaInspection,
  MediaModelContext,
  MediaTranscriptionBundle,
  MediaTranscriptionOptions,
} from "../types";

export interface MediaTranscriptionDependencies {
  inspect: (path: string) => MediaInspection;
  bundle: (path: string) => MediaBundle;
  buildSignals: (inspection: MediaInspection) => string[];
  requestModelText: (
    prompt: string,
    context: MediaModelContext | undefined,
    metadata: { focus: string; inspection: MediaInspection; signals: string[] },
  ) => Promise<string>;
}

export async function executeMediaTranscription(input: {
  outputDir: string;
  path: string;
  options?: MediaTranscriptionOptions;
  modelContext?: MediaModelContext;
  dependencies: MediaTranscriptionDependencies;
}): Promise<MediaTranscriptionBundle> {
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
  const { promptPath, manifestPath, reportPath, transcriptPath, responsePath } =
    buildMediaTranscriptionPaths(input.outputDir, stamp, label);
  const signals = input.dependencies.buildSignals(inspection);
  const prompt = buildMediaTranscriptionPrompt(inspection, signals);
  let transcriptText = "";
  let response = "";
  let source: MediaTranscriptionBundle["source"] = "offline";

  if (
    modelContext?.provider === "openai" &&
    modelContext.openAiApiKey &&
    inspection.exists &&
    !inspection.isDirectory
  ) {
    try {
      const fileBytes = readFileSync(inspection.path);
      const form = new FormData();
      form.append("model", modelContext.model);
      form.append(
        "file",
        new Blob([fileBytes], {
          type: inspection.mimeType || "application/octet-stream",
        }),
        inspection.basename,
      );
      if (options.language) {
        form.append("language", options.language);
      }
      form.append("prompt", options.prompt ?? prompt);
      const transcriptionResponse = await fetch(
        `${modelContext.baseUrl}/audio/transcriptions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${modelContext.openAiApiKey}`,
          },
          body: form,
        },
      );

      if (!transcriptionResponse.ok) {
        const body = await transcriptionResponse.text();
        throw new Error(
          `OpenAI transcription failed (${transcriptionResponse.status}): ${body}`,
        );
      }

      const data = (await transcriptionResponse.json()) as {
        text?: string;
      };
      transcriptText = data.text?.trim() ?? "";
      response = transcriptText;
      source = "openai";
    } catch (error) {
      response = error instanceof Error ? error.message : String(error);
    }
  }

  if (
    !transcriptText &&
    inspection.transcriptPath &&
    existsSync(inspection.transcriptPath)
  ) {
    transcriptText = readFileSync(inspection.transcriptPath, "utf8").trim();
    source = "sidecar";
    response = `Used existing transcript sidecar at ${inspection.transcriptPath}.`;
  }

  if (
    !transcriptText &&
    modelContext?.provider === "anthropic" &&
    modelContext.anthropicApiKey
  ) {
    try {
      transcriptText = await input.dependencies.requestModelText(
        prompt,
        modelContext,
        {
          focus: "voice",
          inspection,
          signals,
        },
      );
      source = "anthropic";
      response = "Generated a best-effort provider-backed transcript summary.";
    } catch (error) {
      response = error instanceof Error ? error.message : String(error);
    }
  }

  if (!transcriptText) {
    transcriptText = [
      `Doolittle offline transcript for ${inspection.basename}.`,
      inspection.transcriptPreview
        ? `Transcript sidecar preview: ${inspection.transcriptPreview}`
        : undefined,
      inspection.captionPreview
        ? `Caption sidecar preview: ${inspection.captionPreview}`
        : undefined,
      inspection.detail,
    ]
      .filter(Boolean)
      .join("\n");
    response = "Generated an offline transcript fallback.";
  }

  writeFileSync(transcriptPath, `${transcriptText.trim()}\n`, "utf8");
  writeFileSync(
    promptPath,
    [
      `# Transcription Prompt`,
      "",
      `Source path: ${inspection.path}`,
      `Provider: ${modelContext?.provider ?? "offline"}`,
      `Model: ${modelContext?.model ?? "offline"}`,
      `Source: ${source}`,
      "",
      prompt,
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    manifestPath,
    JSON.stringify(
      buildMediaTranscriptionManifest(
        new Date().toISOString(),
        prompt,
        transcriptText,
        source,
        modelContext?.provider ?? "offline",
        modelContext?.model ?? "offline",
        {
          transcriptPath,
          responsePath,
        },
        inspection,
        bundle,
        response,
      ),
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    reportPath,
    buildMediaTranscriptionReport(
      inspection,
      prompt,
      transcriptText,
      response,
      bundle,
      signals,
      modelContext?.provider ?? "offline",
      modelContext?.model ?? "offline",
      source,
    ),
    "utf8",
  );

  return {
    inspection,
    bundle,
    prompt,
    transcriptText,
    transcriptPath,
    promptPath,
    manifestPath,
    reportPath,
    responsePath,
    response,
    model: modelContext?.model ?? "offline",
    provider: modelContext?.provider ?? "offline",
    source,
  };
}
