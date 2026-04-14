import { compareEffectiveBrowserPages } from "@/runtime/native/service-bridge/browser";
import type { AgentExecutionContext } from "../../../chat";
import type { BrowserMediaCommandOptions, CommandResult } from "../types";
import { handleBrowserComparisonAnalysisCommand } from "./analyze";

export async function handleBrowserCompareCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: BrowserMediaCommandOptions,
): Promise<CommandResult> {
  const compareAnalysisResponse = await handleBrowserComparisonAnalysisCommand(
    trimmed,
    context,
    options,
  );
  if (typeof compareAnalysisResponse !== "undefined") {
    return compareAnalysisResponse;
  }

  if (trimmed.startsWith("/browser compare ")) {
    const payload = trimmed.replace("/browser compare ", "");
    const [leftUrl, rightUrl] = payload.split("::").map((part) => part.trim());
    if (!leftUrl || !rightUrl) {
      return "Usage: /browser compare <left-url> :: <right-url>";
    }
    return JSON.stringify(
      await compareEffectiveBrowserPages(
        context.runtime,
        context.services,
        leftUrl,
        rightUrl,
      ),
      null,
      2,
    );
  }

  return undefined;
}
