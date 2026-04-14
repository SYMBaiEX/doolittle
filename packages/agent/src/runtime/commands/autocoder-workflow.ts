import { createEffectiveDelegationTask } from "@/runtime/native/service-bridge/delegation";
import type { AgentExecutionContext } from "../chat";

function currentCliSessionId(context: AgentExecutionContext): string {
  return (
    context.services.sessions.listSessions(1)[0]?.sessionId ?? "cli:local-user"
  );
}

export function createAutocoderWorkflow(
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
  const task = createEffectiveDelegationTask(
    context.runtime,
    context.services,
    {
      title: input.title,
      objective: input.objective,
      group: "autocoder",
      profile: "native",
      priority: "normal",
      labels: ["autocoder", input.kind],
      metadata: {
        kind: input.kind,
        sessionId,
        projectName: input.projectName ?? "",
        repositoryName: input.repositoryName ?? "",
      },
      executionMode: "local",
    },
  ) as { id: string };
  context.services.delegation.markRunning(task.id);
  const workflow = context.services.autocoderPipeline.startWorkflow({
    title: input.title,
    objective: input.objective,
    kind: input.kind,
    projectName: input.projectName,
    repositoryName: input.repositoryName,
    sessionId,
    taskId: task.id,
  });
  context.services.delegation.addNote(
    task.id,
    `system: attached autocoder workflow ${workflow.id}`,
  );
  return {
    sessionId,
    taskId: task.id,
    workflowId: workflow.id,
  };
}

export function completeAutocoderWorkflow(
  context: AgentExecutionContext,
  taskId: string,
  workflowId: string,
  note: string,
): void {
  context.services.delegation.complete(
    taskId,
    `${note} workflow=${workflowId}`,
  );
}

export function failAutocoderWorkflow(
  context: AgentExecutionContext,
  taskId: string,
  workflowId: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  context.services.delegation.fail(taskId, `${message} workflow=${workflowId}`);
}
