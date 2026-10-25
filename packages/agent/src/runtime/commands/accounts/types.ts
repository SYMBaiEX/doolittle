import type { ChatTurnRequest } from "../../../types/runtime/index";
import type { AgentExecutionContext, AgentTurnHooks } from "../../chat";

export type AccountsCommandInput = ChatTurnRequest;
export type AccountsCommandContext = AgentExecutionContext;
export type AccountsCommandHooks = AgentTurnHooks | undefined;
