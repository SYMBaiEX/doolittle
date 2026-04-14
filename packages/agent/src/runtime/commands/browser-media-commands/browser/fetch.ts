import { fetchEffectiveBrowserPage } from "@/runtime/native/service-bridge/browser";
import type { AgentExecutionContext } from "../../../chat";
import type { CommandResult } from "../types";

export async function handleBrowserFetchCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<CommandResult> {
  if (trimmed.startsWith("/web fetch ")) {
    const url = trimmed.replace("/web fetch ", "").trim();
    return JSON.stringify(
      await fetchEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/browser fetch ")) {
    const url = trimmed.replace("/browser fetch ", "").trim();
    return JSON.stringify(
      await fetchEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  return undefined;
}
