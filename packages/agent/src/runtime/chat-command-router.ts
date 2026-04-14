import { normalizeSlashCommandSyntax } from "@/runtime/command-catalog";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "./chat";
import { lifecycleAndIdentityRoutes } from "./chat-command-router/lifecycle-and-identity";
import { planningAndSettingsRoutes } from "./chat-command-router/planning-and-settings";
import { runtimeOperationsRoutes } from "./chat-command-router/runtime-operations";
import { runCommandRouteGroup } from "./chat-command-router/shared";
import type {
  ChatCommandRouteGroup,
  ChatCommandRouterDependencies,
  ChatCommandRouteState,
} from "./chat-command-router/types";
import { workflowAndToolingRoutes } from "./chat-command-router/workflow-and-tooling";

const commandRouteGroups = [
  lifecycleAndIdentityRoutes,
  workflowAndToolingRoutes,
  runtimeOperationsRoutes,
  planningAndSettingsRoutes,
] as const satisfies readonly ChatCommandRouteGroup[];

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

  for (const routes of commandRouteGroups) {
    const response = await runCommandRouteGroup(state, routes);
    if (response) {
      return response;
    }
  }

  return undefined;
}
