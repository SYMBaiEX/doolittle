import type { MediaAnalysisBundle } from "../../../types";

export function buildMediaAnalysisManifest(
  createdAt: string,
  analysis: MediaAnalysisBundle,
  response: string,
  provider: string,
  model: string,
): {
  createdAt: string;
  analysis: MediaAnalysisBundle;
  response: string;
  provider: string;
  model: string;
} {
  return {
    createdAt,
    analysis,
    response,
    provider,
    model,
  };
}
