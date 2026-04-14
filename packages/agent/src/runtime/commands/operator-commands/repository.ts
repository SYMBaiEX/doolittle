import {
  getEffectiveRepositoryDiff,
  getEffectiveRepositoryLog,
  getEffectiveRepositoryStatus,
} from "@/runtime/native/service-bridge/tooling";
import type { AgentExecutionContext } from "../../chat";

export async function handleOperatorRepositoryCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/repo" || trimmed === "/repo status") {
    return String(
      await getEffectiveRepositoryStatus(context.runtime, context.services),
    );
  }

  if (trimmed === "/repo diff") {
    return String(
      await getEffectiveRepositoryDiff(context.runtime, context.services),
    );
  }

  if (trimmed === "/repo log") {
    return String(
      await getEffectiveRepositoryLog(context.runtime, context.services),
    );
  }

  return undefined;
}
