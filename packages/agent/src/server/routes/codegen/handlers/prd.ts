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
  const workflow = createAutocoderWorkflowContext(context, {
    title: `PRD ${body.projectName}`,
    objective: body.description,
    kind: "prd",
    projectName: body.projectName,
  });

  try {
    const research = await performEffectiveCodeResearch(
      context.runtime,
      requestPayload,
    );
    const researchRun = context.services.autocoderPipeline.record({
      workflowId: workflow.workflowId,
      kind: "research",
      projectName: body.projectName,
      sessionId: workflow.sessionId,
      taskId: workflow.taskId,
      request: requestPayload,
      result: research,
    });
    const prd = await generateEffectivePrd(
      context.runtime,
      requestPayload,
      research as Record<string, unknown>,
    );
    const prdRun = context.services.autocoderPipeline.record({
      workflowId: workflow.workflowId,
      kind: "prd",
      projectName: body.projectName,
      sessionId: workflow.sessionId,
      taskId: workflow.taskId,
      request: requestPayload,
      result: prd,
      linkedRunIds: [researchRun.id],
      parentRunId: researchRun.id,
    });
    completeAutocoderWorkflowContext(
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
    failAutocoderWorkflowContext(
      context,
      workflow.taskId,
      workflow.workflowId,
      error,
    );
    throw error;
  }
};
