import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "../../chat";

export type AccountsCommandInput = ChatTurnRequest;
export type AccountsCommandContext = AgentExecutionContext;
export type AccountsCommandHooks = AgentTurnHooks | undefined;
