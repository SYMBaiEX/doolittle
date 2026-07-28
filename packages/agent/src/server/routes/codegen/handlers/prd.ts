import {
  generateEffectivePrd,
  performEffectiveCodeResearch,
} from "@/runtime/native/service-bridge/autocoder";
import {
  completeAutocoderWorkflowContext,
  createAutocoderWorkflowContext,
  failAutocoderWorkflowContext,
} from "@/server/autocoder-workflow-context";
import { json } from "@/server/responses";
import {
  executeTrackedAutocoderRun,
  isAutocoderCancellation,
  withAutocoderAbortSignal,
} from "@/server/routes/codegen/run-execution";
import type { CodegenRouteHandler } from "@/server/routes/codegen/types";

export const handleCodegenPRDRoutes: CodegenRouteHandler = async (
  context,
  request,
  url,
) => {
  if (request.method !== "POST" || url.pathname !== "/codegen/prd") {
    return null;
  }

  const body = (await request.json()) as {
    projectName?: string;
    targetType?: string;
    description?: string;
    apis?: string[];
    requirements?: string[];
  };
  if (!body.projectName || !body.description) {
    return json({ error: "projectName and description are required" }, 400);
  }

  const requestPayload = {
    projectName: body.projectName,
    targetType: body.targetType ?? "plugin",
    description: body.description,
    apis: body.apis ?? [],
    requirements: body.requirements ?? [],
  };
  const workflow = await createAutocoderWorkflowContext(context, {
    title: `PRD ${body.projectName}`,
    objective: body.description,
    kind: "prd",
    projectName: body.projectName,
  });

  try {
    const { run: researchRun, result: research } =
      await executeTrackedAutocoderRun(
        context,
        {
          workflowId: workflow.workflowId,
          kind: "research",
          projectName: body.projectName,
          sessionId: workflow.sessionId,
          taskId: workflow.taskId,
          request: requestPayload,
        },
        (signal) =>
          performEffectiveCodeResearch(
            context.runtime,
            withAutocoderAbortSignal(requestPayload, signal),
          ),
      );
    const { run: prdRun, result: prd } = await executeTrackedAutocoderRun(
      context,
      {
        workflowId: workflow.workflowId,
        kind: "prd",
        projectName: body.projectName,
        sessionId: workflow.sessionId,
        taskId: workflow.taskId,
        request: requestPayload,
        parentRunId: researchRun.id,
      },
      (signal) =>
        generateEffectivePrd(
          context.runtime,
          withAutocoderAbortSignal(requestPayload, signal),
          research as Record<string, unknown>,
        ),
      { linkedRunIds: [researchRun.id] },
    );
    await completeAutocoderWorkflowContext(
      context,
      workflow.taskId,
      workflow.workflowId,
      "system: PRD workflow completed",
    );
    return json({
      workflowId: workflow.workflowId,
      taskId: workflow.taskId,
      researchRun,
      prdRun,
      research,
      prd,
    });
  } catch (error) {
    if (isAutocoderCancellation(error)) {
      await failAutocoderWorkflowContext(
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
    await failAutocoderWorkflowContext(
      context,
      workflow.taskId,
      workflow.workflowId,
      error,
    );
    throw error;
  }
};
