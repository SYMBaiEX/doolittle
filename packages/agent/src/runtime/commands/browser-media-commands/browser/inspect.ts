import {
  getEffectiveBrowserStatus,
  inspectEffectiveBrowserPage,
} from "@/runtime/native/service-bridge/browser";
import type { AgentExecutionContext } from "../../../chat";
import type { CommandResult } from "../types";

export async function handleBrowserInspectCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<CommandResult> {
  if (trimmed === "/browser" || trimmed === "/browser status") {
    return JSON.stringify(
      await getEffectiveBrowserStatus(context.runtime, context.services),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/browser inspect ")) {
    const url = trimmed.replace("/browser inspect ", "").trim();
    return JSON.stringify(
      await inspectEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/web inspect ")) {
    const url = trimmed.replace("/web inspect ", "").trim();
    return JSON.stringify(
      await inspectEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  return undefined;
}
