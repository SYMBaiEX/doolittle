import { mkdirSync, writeFileSync } from "node:fs";
import {
  buildMediaAnalysisManifest,
  buildMediaAnalysisReport,
} from "../formatters/analysis";
import { buildMediaAnalysisPaths, slugifyMediaText } from "../paths";
import type {
  MediaAnalysisBundle,
  MediaModelAnalysisBundle,
  MediaModelContext,
} from "../types";

export interface PersistMediaAnalysisArtifactsInput {
  analysis: MediaAnalysisBundle;
  outputDir: string;
  modelContext?: MediaModelContext;
  response: string;
}

export function persistMediaAnalysisArtifacts(
  input: PersistMediaAnalysisArtifactsInput,
): MediaModelAnalysisBundle {
  mkdirSync(input.outputDir, { recursive: true });

  const stamp = Date.now();
  const slug = slugifyMediaText(
    `${input.analysis.focus}-${input.analysis.inspection.basename}-${input.analysis.inspection.contentHash ?? "analysis"}`,
  );
  const { manifestPath, reportPath, responsePath } = buildMediaAnalysisPaths(
    input.outputDir,
    stamp,
    slug,
  );
  const provider = input.modelContext?.provider ?? "offline";
  const model = input.modelContext?.model ?? "offline";

  writeFileSync(
    manifestPath,
    JSON.stringify(
      buildMediaAnalysisManifest(
        new Date().toISOString(),
        input.analysis,
        input.response,
        provider,
        model,
      ),
      null,
      2,
    ),
    "utf8",
  );

  writeFileSync(
    reportPath,
    buildMediaAnalysisReport(input.analysis, input.response, provider, model),
    "utf8",
  );

  writeFileSync(responsePath, input.response, "utf8");

  return {
    analysis: input.analysis,
    response: input.response,
    responsePath,
    reportPath,
    manifestPath,
    model,
    provider,
  };
}
