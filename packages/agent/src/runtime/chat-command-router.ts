import { normalizeSlashCommandSyntax } from "@/runtime/command-catalog";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "./chat";
import { CHAT_COMMAND_ROUTE_GROUPS } from "./chat-command-router/registry";
import { runCommandRouteGroup } from "./chat-command-router/shared";
import type {
  ChatCommandRouterDependencies,
  ChatCommandRouteState,
} from "./chat-command-router/types";

function createCommandRouteState(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  hooks: AgentTurnHooks | undefined,
  dependencies: ChatCommandRouterDependencies,
): ChatCommandRouteState {
  return {
    input,
    trimmed: normalizeSlashCommandSyntax(input.message.trim()),
    sessionKey: input.roomId ?? `room:${input.userId}`,
    context,
    hooks,
    dependencies,
  };
}

export async function buildCommandResponse(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  hooks: AgentTurnHooks | undefined,
  dependencies: ChatCommandRouterDependencies,
): Promise<string | undefined> {
  const state = createCommandRouteState(input, context, hooks, dependencies);

  for (const routes of CHAT_COMMAND_ROUTE_GROUPS) {
    const response = await runCommandRouteGroup(state, routes);
    if (response) {
      return response;
    }
  }

  return undefined;
}
