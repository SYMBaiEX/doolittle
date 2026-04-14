import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "../chat";

export type ChatCommandRouterDependencies = {
  runAnalysis: (prompt: string, label: string) => Promise<string>;
  runDelegationTaskInWorker: (
    taskId: string,
    options?: { assumeRunning?: boolean },
  ) => Promise<
    ReturnType<AgentExecutionContext["services"]["delegation"]["get"]>
  >;
};

export type ChatCommandRouteState = {
  input: ChatTurnRequest;
  trimmed: string;
  sessionKey: string;
  context: AgentExecutionContext;
  hooks: AgentTurnHooks | undefined;
  dependencies: ChatCommandRouterDependencies;
};

export type ChatCommandRouteHandler = (
  state: ChatCommandRouteState,
) => Promise<string | undefined>;

export type ChatCommandRouteGroup = readonly ChatCommandRouteHandler[];
