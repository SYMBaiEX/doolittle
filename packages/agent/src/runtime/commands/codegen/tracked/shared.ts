import type { AgentExecutionContext } from "../../../chat";

type CodegenRunKind = "generate" | "research" | "prd" | "qa";

interface CodegenRunInput {
  kind: CodegenRunKind;
  projectName?: string;
  request: Record<string, unknown>;
  result: unknown;
  linkedRunIds?: string[];
  parentRunId?: string;
}

interface CodegenWorkflow {
  workflowId: string;
  sessionId: string;
  taskId: string;
}

export interface CodegenWorkflowResult<T> {
  workflow: CodegenWorkflow;
  request: Record<string, unknown>;
  result: T;
  run: { id: string };
}

export function createAutocoderRunRecord(
  context: AgentExecutionContext,
  workflow: CodegenWorkflow,
  input: CodegenRunInput,
): { id: string } {
  return context.services.autocoderPipeline.record({
    workflowId: workflow.workflowId,
    kind: input.kind,
    projectName: input.projectName,
    sessionId: workflow.sessionId,
    taskId: workflow.taskId,
    request: input.request,
    result: input.result,
    linkedRunIds: input.linkedRunIds,
    parentRunId: input.parentRunId,
  });
}
