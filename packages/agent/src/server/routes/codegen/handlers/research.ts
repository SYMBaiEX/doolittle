import { performEffectiveCodeResearch } from "@/runtime/native/service-bridge/index";
import {
  completeAutocoderWorkflowContext,
  createAutocoderWorkflowContext,
  failAutocoderWorkflowContext,
} from "@/server/autocoder-workflow-context";
import { json } from "@/server/responses";
import type { CodegenRouteHandler } from "@/server/routes/codegen/types";

export const handleCodegenResearchRoutes: CodegenRouteHandler = async (
  context,
  request,
  url,
) => {
  if (request.method !== "POST" || url.pathname !== "/codegen/research") {
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
    title: `Research ${body.projectName}`,
    objective: body.description,
    kind: "research",
    projectName: body.projectName,
  });

  try {
    const research = await performEffectiveCodeResearch(
      context.runtime,
      requestPayload,
    );
    const run = context.services.autocoderPipeline.record({
      workflowId: workflow.workflowId,
      kind: "research",
      projectName: body.projectName,
      sessionId: workflow.sessionId,
      taskId: workflow.taskId,
      request: requestPayload,
      result: research,
    });
    completeAutocoderWorkflowContext(
      context,
      workflow.taskId,
      workflow.workflowId,
      "system: research completed",
    );
    return json({
      workflowId: workflow.workflowId,
      taskId: workflow.taskId,
      run,
      research,
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
