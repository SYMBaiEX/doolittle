import type { AgentExecutionContext } from "../../../chat";
import {
  captureBrowserPage,
  screenshotBrowserPage,
  snapshotBrowserPage,
} from "../../../native/service-bridge/browser/index";
import type { CommandResult } from "../types";

export async function handleBrowserCaptureCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<CommandResult> {
  if (trimmed.startsWith("/browser snapshot ")) {
    const url = trimmed.replace("/browser snapshot ", "").trim();
    return await snapshotBrowserPage(context.runtime, url);
  }

  if (trimmed.startsWith("/web snapshot ")) {
    const url = trimmed.replace("/web snapshot ", "").trim();
    return await snapshotBrowserPage(context.runtime, url);
  }

  if (trimmed.startsWith("/browser screenshot ")) {
    const url = trimmed.replace("/browser screenshot ", "").trim();
    return await screenshotBrowserPage(context.runtime, url);
  }

  if (trimmed.startsWith("/browser capture ")) {
    const url = trimmed.replace("/browser capture ", "").trim();
    return JSON.stringify(
      await captureBrowserPage(context.runtime, url),
      null,
      2,
    );
  }

  return undefined;
}
