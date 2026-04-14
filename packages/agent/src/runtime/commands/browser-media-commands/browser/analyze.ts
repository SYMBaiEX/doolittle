import {
  analyzeEffectiveBrowserComparison,
  analyzeEffectiveBrowserPage,
} from "@/runtime/native/service-bridge/browser";
import type { AgentExecutionContext } from "../../../chat";
import type { BrowserMediaCommandOptions, CommandResult } from "../types";

export async function handleBrowserAnalyzeCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: BrowserMediaCommandOptions,
): Promise<CommandResult> {
  if (trimmed.startsWith("/browser analyze ")) {
    const url = trimmed.replace("/browser analyze ", "").trim();
    if (!url) {
      return "Usage: /browser analyze <url>";
    }
    const analysis = await analyzeEffectiveBrowserPage(
      context.runtime,
      context.services,
      url,
    );
    const response = await options.runAnalysis(analysis.prompt, "browser");
    return JSON.stringify({ analysis, response }, null, 2);
  }

  return undefined;
}

export async function handleBrowserComparisonAnalysisCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: BrowserMediaCommandOptions,
): Promise<CommandResult> {
  if (trimmed.startsWith("/browser compare analyze ")) {
    const payload = trimmed.replace("/browser compare analyze ", "");
    const [leftUrl, rightUrl] = payload.split("::").map((part) => part.trim());
    if (!leftUrl || !rightUrl) {
      return "Usage: /browser compare analyze <left-url> :: <right-url>";
    }

    const analysis = await analyzeEffectiveBrowserComparison(
      context.runtime,
      context.services,
      leftUrl,
      rightUrl,
    );
    const response = await options.runAnalysis(
      analysis.prompt,
      "browser-comparison",
    );
    return JSON.stringify({ analysis, response }, null, 2);
  }

  return undefined;
}
