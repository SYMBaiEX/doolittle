import { getNativeExecutionControlPlane } from "@/runtime/native/service-bridge/control-planes";
import type { AgentExecutionContext } from "../../chat";
import { handleCodegenE2bCommand } from "./e2b";
import { stringifyCodegenResponse } from "./support";

export async function handleCodegenRuntimeCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  const e2bResponse = await handleCodegenE2bCommand(trimmed, context);
  if (e2bResponse !== undefined) {
    return e2bResponse;
  }

  if (trimmed === "/runtime codegen") {
    return stringifyCodegenResponse(
      getNativeExecutionControlPlane(context.runtime),
    );
  }

  return undefined;
}
