import type { AppContext } from "@/runtime/bootstrap";
import {
  completeLinkedAutocoderWorkflow,
  createLinkedAutocoderWorkflow,
  failLinkedAutocoderWorkflow,
} from "@/services/autocoder-workflow-context";

export async function createAutocoderWorkflowContext(
  context: AppContext,
  input: {
    title: string;
    objective: string;
    kind: Parameters<
      AppContext["services"]["autocoderPipeline"]["startWorkflow"]
    >[0]["kind"];
    projectName?: string;
    repositoryName?: string;
    sessionId?: string;
  },
) {
  return createLinkedAutocoderWorkflow(context, {
    ...input,
    sessionId: input.sessionId ?? "api:local-user",
  });
}

export async function completeAutocoderWorkflowContext(
  context: AppContext,
  taskId: string,
  workflowId: string,
  note: string,
): Promise<void> {
  await completeLinkedAutocoderWorkflow(context, taskId, workflowId, note);
}

export async function failAutocoderWorkflowContext(
  context: AppContext,
  taskId: string,
  workflowId: string,
  error: unknown,
): Promise<void> {
  await failLinkedAutocoderWorkflow(context, taskId, workflowId, error);
}
