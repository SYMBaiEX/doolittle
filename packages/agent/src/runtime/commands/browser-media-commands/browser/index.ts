import type { AgentExecutionContext } from "../../../chat";
import type {
  AnalysisLabel,
  BrowserMediaCommandOptions,
  CommandResult,
} from "../types";

import { handleBrowserAnalyzeCommand } from "./analyze";
import { handleBrowserCaptureCommand } from "./capture";
import { handleBrowserCompareCommand } from "./compare";
import { handleBrowserFetchCommand } from "./fetch";
import { handleBrowserInspectCommand } from "./inspect";

export async function handleBrowserCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: BrowserMediaCommandOptions,
): Promise<CommandResult> {
  const analyzeResponse = await handleBrowserAnalyzeCommand(
    trimmed,
    context,
    options,
  );
  if (typeof analyzeResponse !== "undefined") {
    return analyzeResponse;
  }

  const inspectResponse = await handleBrowserInspectCommand(trimmed, context);
  if (typeof inspectResponse !== "undefined") {
    return inspectResponse;
  }

  const compareResponse = await handleBrowserCompareCommand(
    trimmed,
    context,
    options,
  );
  if (typeof compareResponse !== "undefined") {
    return compareResponse;
  }

  const captureResponse = await handleBrowserCaptureCommand(trimmed, context);
  if (typeof captureResponse !== "undefined") {
    return captureResponse;
  }

  return handleBrowserFetchCommand(trimmed, context);
}

export type { AnalysisLabel, BrowserMediaCommandOptions };
