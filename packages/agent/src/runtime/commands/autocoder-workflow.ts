import {
  completeLinkedAutocoderWorkflow,
  createLinkedAutocoderWorkflow,
  failLinkedAutocoderWorkflow,
} from "@/services/autocoder-workflow-context";
import type { AgentExecutionContext } from "../chat";

function currentCliSessionId(context: AgentExecutionContext): string {
  return (
    context.services.sessions.listSessions(1)[0]?.sessionId ?? "cli:local-user"
  );
}

export async function createAutocoderWorkflow(
  context: AgentExecutionContext,
  input: {
    title: string;
    objective: string;
    kind: Parameters<
      AgentExecutionContext["services"]["autocoderPipeline"]["startWorkflow"]
    >[0]["kind"];
    projectName?: string;
    repositoryName?: string;
  },
) {
  const sessionId = currentCliSessionId(context);
  return createLinkedAutocoderWorkflow(context, {
    ...input,
    sessionId,
  });
}

export async function completeAutocoderWorkflow(
  context: AgentExecutionContext,
  taskId: string,
  workflowId: string,
  note: string,
): Promise<void> {
  await completeLinkedAutocoderWorkflow(context, taskId, workflowId, note);
}

export async function failAutocoderWorkflow(
  context: AgentExecutionContext,
  taskId: string,
  workflowId: string,
  error: unknown,
): Promise<void> {
  await failLinkedAutocoderWorkflow(context, taskId, workflowId, error);
}
