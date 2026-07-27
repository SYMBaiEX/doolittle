import { performEffectiveCodeQa } from "@/runtime/native/service-bridge/autocoder";
import {
  completeAutocoderWorkflowContext,
  createAutocoderWorkflowContext,
  failAutocoderWorkflowContext,
} from "@/server/autocoder-workflow-context";
import { json } from "@/server/responses";
import {
  executeTrackedAutocoderRun,
  isAutocoderCancellation,
} from "@/server/routes/codegen/run-execution";
import type { CodegenRouteHandler } from "@/server/routes/codegen/types";

export const handleCodegenQA: CodegenRouteHandler = async (
  context,
  request,
  url,
) => {
  if (request.method !== "POST" || url.pathname !== "/codegen/qa") {
    return null;
  }

  const body = (await request.json()) as {
    projectPath?: string;
  };
  if (!body.projectPath) {
    return json({ error: "projectPath is required" }, 400);
  }
  const projectName = body.projectPath.split("/").filter(Boolean).at(-1);
  const workflow = createAutocoderWorkflowContext(context, {
    title: `QA ${projectName ?? "project"}`,
    objective: `QA ${body.projectPath}`,
    kind: "qa",
    projectName,
  });

  try {
    const { run, result: qa } = await executeTrackedAutocoderRun(
      context,
      {
        workflowId: workflow.workflowId,
        kind: "qa",
        projectName,
        sessionId: workflow.sessionId,
        taskId: workflow.taskId,
        request: { projectPath: body.projectPath },
      },
      () => performEffectiveCodeQa(context.runtime, body.projectPath as string),
    );
    completeAutocoderWorkflowContext(
      context,
      workflow.taskId,
      workflow.workflowId,
      "system: QA completed",
    );
    return json({
      workflowId: workflow.workflowId,
      taskId: workflow.taskId,
      run,
      qa,
    });
  } catch (error) {
    if (isAutocoderCancellation(error)) {
      failAutocoderWorkflowContext(
        context,
        workflow.taskId,
        workflow.workflowId,
        error,
      );
      return json(
        {
          error: error.message,
          runId: error.runId,
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          cancelled: true,
        },
        409,
      );
    }
    failAutocoderWorkflowContext(
      context,
      workflow.taskId,
      workflow.workflowId,
      error,
    );
    throw error;
  }
};
