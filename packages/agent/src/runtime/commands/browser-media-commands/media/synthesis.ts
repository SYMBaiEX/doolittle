import type { AgentExecutionContext } from "../../../chat";
import type { BrowserMediaCommandOptions, CommandResult } from "../types";

export async function handleMediaSynthesisCommand(
  trimmed: string,
  context: AgentExecutionContext,
  _options: BrowserMediaCommandOptions,
): Promise<CommandResult> {
  void _options;
  if (trimmed.startsWith("/media generate ")) {
    const prompt = trimmed.replace("/media generate ", "").trim();
    if (!prompt) {
      return "Usage: /media generate <prompt>";
    }
    return JSON.stringify(
      await context.services.media.generateImage(prompt),
      null,
      2,
    );
  }

  return undefined;
}
