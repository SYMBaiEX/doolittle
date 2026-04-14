import type { AgentExecutionContext } from "../../chat";
import { parseNamedToolPayload } from "./shared";

export async function handleAcpCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/acp" || trimmed === "/acp status") {
    return JSON.stringify(context.services.acp.status(), null, 2);
  }

  if (trimmed === "/acp registry") {
    return JSON.stringify(context.services.acp.registry(), null, 2);
  }

  if (trimmed === "/acp package") {
    return JSON.stringify(context.services.acp.packageMetadata(), null, 2);
  }

  if (trimmed === "/acp editor" || trimmed === "/acp install") {
    return JSON.stringify(context.services.acp.editorSummary(), null, 2);
  }

  if (trimmed === "/acp sessions") {
    return JSON.stringify(context.services.acp.sessionSummary(), null, 2);
  }

  if (trimmed === "/acp publish") {
    return JSON.stringify(context.services.acp.publishRegistry(), null, 2);
  }

  if (trimmed.startsWith("/acp export")) {
    const label = trimmed.replace("/acp export", "").trim() || "latest";
    return JSON.stringify(context.services.acp.exportBundle(label), null, 2);
  }

  if (trimmed.startsWith("/acp import ")) {
    const input = trimmed.replace("/acp import ", "").trim();
    if (!input) {
      return "Usage: /acp import <path-or-json>";
    }
    return JSON.stringify(context.services.acp.importBundle(input), null, 2);
  }

  if (trimmed === "/acp probe") {
    return JSON.stringify(await context.services.acp.probe(), null, 2);
  }

  if (trimmed === "/acp tools") {
    return JSON.stringify(context.services.acp.tools(), null, 2);
  }

  if (trimmed.startsWith("/acp search ")) {
    const query = trimmed.replace("/acp search ", "").trim();
    if (!query) {
      return "Usage: /acp search <query>";
    }
    return JSON.stringify(context.services.acp.searchTools(query), null, 2);
  }

  if (trimmed.startsWith("/acp describe ")) {
    const name = trimmed.replace("/acp describe ", "").trim();
    if (!name) {
      return "Usage: /acp describe <tool-name>";
    }
    return context.services.acp.describeTool(name);
  }

  if (trimmed.startsWith("/acp invoke ")) {
    const input = trimmed.replace("/acp invoke ", "").trim();
    return JSON.stringify(await context.services.acp.invoke(input), null, 2);
  }

  if (trimmed.startsWith("/acp call ")) {
    const payload = parseNamedToolPayload(trimmed.replace("/acp call ", ""));
    if (!payload) {
      return "Usage: /acp call <toolName> :: <json-input>";
    }
    return JSON.stringify(
      await context.services.acp.invokeTool(
        payload.toolName,
        payload.parsedInput,
      ),
      null,
      2,
    );
  }

  return undefined;
}
