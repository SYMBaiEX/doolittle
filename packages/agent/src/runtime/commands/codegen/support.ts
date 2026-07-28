import type { AgentExecutionContext } from "../../chat";
import {
  completeAutocoderWorkflow,
  createAutocoderWorkflow,
  failAutocoderWorkflow,
} from "../autocoder-workflow";

type WorkflowInput = Parameters<typeof createAutocoderWorkflow>[1];
type WorkflowRef = Awaited<ReturnType<typeof createAutocoderWorkflow>>;

export function stringifyCodegenResponse(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export async function withAutocoderWorkflow<T>(
  context: AgentExecutionContext,
  workflowInput: WorkflowInput,
  successNote: string,
  execute: (workflow: WorkflowRef) => Promise<T>,
): Promise<T> {
  const workflow = await createAutocoderWorkflow(context, workflowInput);
  try {
    const result = await execute(workflow);
    await completeAutocoderWorkflow(
      context,
      workflow.taskId,
      workflow.workflowId,
      successNote,
    );
    return result;
  } catch (error) {
    await failAutocoderWorkflow(
      context,
      workflow.taskId,
      workflow.workflowId,
      error,
    );
    throw error;
  }
}
