import type { IAgentRuntime } from "@elizaos/core";
import {
  addEffectiveDelegationNote,
  cancelEffectiveDelegationTask,
  completeEffectiveDelegationTask,
  createEffectiveDelegationTask,
} from "@/runtime/native/service-bridge/delegation";
import type { AppServices } from "./index";

interface AutocoderWorkflowContext {
  runtime: IAgentRuntime;
  services: Pick<AppServices, "autocoderPipeline" | "delegationProjection">;
}

export interface AutocoderWorkflowInput {
  title: string;
  objective: string;
  kind: Parameters<
    AppServices["autocoderPipeline"]["startWorkflow"]
  >[0]["kind"];
  sessionId: string;
  projectName?: string;
  repositoryName?: string;
}

export async function createLinkedAutocoderWorkflow(
  context: AutocoderWorkflowContext,
  input: AutocoderWorkflowInput,
) {
  const task = await createEffectiveDelegationTask(
    context.runtime,
    context.services.delegationProjection,
    {
      title: input.title,
      objective: input.objective,
      group: "autocoder",
      profile: "native",
      priority: "normal",
      labels: ["autocoder", input.kind],
      metadata: {
        kind: input.kind,
        sessionId: input.sessionId,
        projectName: input.projectName ?? "",
        repositoryName: input.repositoryName ?? "",
      },
      executionMode: "local",
    },
  );
  const workflow = context.services.autocoderPipeline.startWorkflow({
    title: input.title,
    objective: input.objective,
    kind: input.kind,
    projectName: input.projectName,
    repositoryName: input.repositoryName,
    sessionId: input.sessionId,
    taskId: task.id,
  });
  await addEffectiveDelegationNote(
    context.runtime,
    context.services.delegationProjection,
    task.id,
    `system: attached autocoder workflow ${workflow.id}`,
  );
  return {
    sessionId: input.sessionId,
    taskId: task.id,
    workflowId: workflow.id,
  };
}

export async function completeLinkedAutocoderWorkflow(
  context: AutocoderWorkflowContext,
  taskId: string,
  workflowId: string,
  note: string,
): Promise<void> {
  await completeEffectiveDelegationTask(
    context.runtime,
    context.services.delegationProjection,
    taskId,
    `${note} workflow=${workflowId}`,
  );
}

export async function failLinkedAutocoderWorkflow(
  context: AutocoderWorkflowContext,
  taskId: string,
  workflowId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await cancelEffectiveDelegationTask(
    context.runtime,
    context.services.delegationProjection,
    taskId,
    `${message} workflow=${workflowId}`,
  );
}
