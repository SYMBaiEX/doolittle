import type { AgentExecutionContext } from "../../../chat";
import type { CommandResult } from "../types";

export async function handleMediaAnalyzeCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<CommandResult> {
  if (trimmed.startsWith("/media analyze ")) {
    const path = trimmed.replace("/media analyze ", "").trim();
    if (!path) {
      return "Usage: /media analyze <path>";
    }
    return JSON.stringify(
      await context.services.media.analyzeWithModel(path),
      null,
      2,
    );
  }

  return undefined;
}
