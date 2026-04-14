import type { AgentExecutionContext } from "../../../chat";
import type { BrowserMediaCommandOptions, CommandResult } from "../types";

import { handleMediaAnalyzeCommand } from "./analyze";
import { handleMediaInspectCommand } from "./inspect";
import { handleMediaSpeechCommand } from "./speech";
import { handleMediaSynthesisCommand } from "./synthesis";

export async function handleMediaCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: BrowserMediaCommandOptions,
): Promise<CommandResult> {
  const inspectResponse = await handleMediaInspectCommand(trimmed, context);
  if (typeof inspectResponse !== "undefined") {
    return inspectResponse;
  }

  const analyzeResponse = await handleMediaAnalyzeCommand(trimmed, context);
  if (typeof analyzeResponse !== "undefined") {
    return analyzeResponse;
  }

  const speechResponse = await handleMediaSpeechCommand(trimmed, context);
  if (typeof speechResponse !== "undefined") {
    return speechResponse;
  }

  return handleMediaSynthesisCommand(trimmed, context, options);
}
