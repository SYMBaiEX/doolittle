import type { AgentExecutionContext } from "../chat";
import { handleAcpCommand } from "./tooling/acp";
import { handleMcpCommand } from "./tooling/mcp";
import { handleToolsCommand } from "./tooling/tools";

export async function handleToolingCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  const toolsResponse = await handleToolsCommand(trimmed, context);
  if (typeof toolsResponse !== "undefined") {
    return toolsResponse;
  }

  const mcpResponse = await handleMcpCommand(trimmed, context);
  if (typeof mcpResponse !== "undefined") {
    return mcpResponse;
  }

  const acpResponse = await handleAcpCommand(trimmed, context);
  if (typeof acpResponse !== "undefined") {
    return acpResponse;
  }

  return undefined;
}
