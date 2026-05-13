import type { AgentExecutionContext } from "../../chat";
import { renderCompressedBundle, renderReplayBundle } from "./bundles";

export async function handleTrajectoryCompressionCommands(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/trajectories compress latest") {
    const compressed = context.services.trajectories.compressLatest();
    return compressed
      ? JSON.stringify(compressed, null, 2)
      : "No trajectory bundles recorded.";
  }

  if (trimmed.startsWith("/trajectories compress ")) {
    const raw = trimmed.replace("/trajectories compress ", "").trim();
    if (!raw) {
      return "Usage: /trajectories compress <manifest-path|bundle-label|latest>";
    }
    return renderCompressedBundle(context, raw);
  }

  if (trimmed.startsWith("/trajectories replay ")) {
    const raw = trimmed.replace("/trajectories replay ", "").trim();
    if (!raw) {
      return "Usage: /trajectories replay <manifest-path|bundle-label|latest>";
    }
    return renderReplayBundle(context, raw);
  }

  return undefined;
}
