import type { TrajectoryReplayResult } from "../../types/trajectory";
import type { ModelAnalysisPort } from "../model-analysis-port";

export function buildOfflineTrajectoryModelText(
  prompt: string,
  metadata: {
    focus: string;
    replay?: TrajectoryReplayResult;
    score?: number;
    findings?: string[];
    recommendations?: string[];
  },
): string {
  return [
    `Offline trajectory analysis for ${metadata.focus}.`,
    metadata.replay ? `Messages: ${metadata.replay.messageCount}` : undefined,
    typeof metadata.score === "number" ? `Score: ${metadata.score}` : undefined,
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

export async function requestTrajectoryModelText(
  prompt: string,
  metadata: Parameters<typeof buildOfflineTrajectoryModelText>[1],
  modelAnalysisPort?: ModelAnalysisPort,
): Promise<string> {
  return modelAnalysisPort
    ? modelAnalysisPort.analyze(prompt)
    : buildOfflineTrajectoryModelText(prompt, metadata);
}
