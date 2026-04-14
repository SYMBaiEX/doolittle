import type { AgentExecutionContext } from "../../chat";
import { handleBrowserCommand } from "./browser";
import { handleMediaCommand } from "./media";
import type { BrowserMediaCommandOptions } from "./types";

export async function handleBrowserMediaCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: BrowserMediaCommandOptions,
): Promise<string | undefined> {
  const browserResponse = await handleBrowserCommand(trimmed, context, options);
  if (typeof browserResponse !== "undefined") {
    return browserResponse;
  }

  return handleMediaCommand(trimmed, context, options);
}
