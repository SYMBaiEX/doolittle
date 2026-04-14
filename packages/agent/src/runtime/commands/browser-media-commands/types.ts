import type { AgentExecutionContext } from "../../chat";

export type AnalysisLabel = "browser" | "browser-comparison";

export interface BrowserMediaCommandOptions {
  runAnalysis: (prompt: string, label: AnalysisLabel) => Promise<string>;
}

export type CommandResult = string | undefined;

export type BrowserMediaCommandHandler = (
  trimmed: string,
  context: AgentExecutionContext,
  options: BrowserMediaCommandOptions,
) => Promise<CommandResult>;
