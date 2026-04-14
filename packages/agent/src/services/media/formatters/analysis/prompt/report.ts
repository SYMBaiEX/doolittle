import type { MediaAnalysisBundle } from "../../../types";
import { listMediaLines } from "../../utils";

export function buildMediaAnalysisReport(
  analysis: MediaAnalysisBundle,
  response: string,
  provider: string,
  model: string,
): string {
  return [
    `# Media Analysis: ${analysis.inspection.basename}`,
    "",
    `- Focus: ${analysis.focus}`,
    `- Provider: ${provider}`,
    `- Model: ${model}`,
    `- Bundle manifest: ${analysis.bundle.manifestPath}`,
    `- Bundle report: ${analysis.bundle.reportPath}`,
    "",
    "## Signals",
    ...listMediaLines(analysis.signals),
    "",
    "## Prompt",
    analysis.prompt,
    "",
    "## Response",
    response,
  ].join("\n");
}

export function buildMediaAnalysisResponseSummary(
  analysis: MediaAnalysisBundle,
  provider: string,
  model: string,
): string {
  return `Analysis completed for ${analysis.inspection.basename} using ${provider}/${model}.`;
}
