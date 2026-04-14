import type { ChatTurnRequest } from "@/types/runtime";

import type { AgentExecutionContext } from "../../chat";

export type RuntimeWorkspaceCommandHandler = (
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
) => Promise<string | undefined> | string | undefined;
