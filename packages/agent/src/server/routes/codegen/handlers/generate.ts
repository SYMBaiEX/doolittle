import { generateEffectiveCode } from "@/runtime/native/service-bridge/index";
import {
  completeAutocoderWorkflowContext,
  createAutocoderWorkflowContext,
  failAutocoderWorkflowContext,
} from "@/server/autocoder-workflow-context";
import { json } from "@/server/responses";
import type { CodegenRouteHandler } from "@/server/routes/codegen/types";

export const handleCodegenGenerateRoutes: CodegenRouteHandler = async (
  context,
  request,
  url,
) => {
  if (request.method !== "POST" || url.pathname !== "/codegen/generate") {
    return null;
  }

  const body = (await request.json()) as {
    projectName?: string;
    prompt?: string;
    [key: string]: unknown;
  };
  if (!body.projectName || !body.prompt) {
    return json({ error: "projectName and prompt are required" }, 400);
  }

  const requestPayload = {
    ...body,
    objective: body.prompt,
  };
  const workflow = createAutocoderWorkflowContext(context, {
    title: `Generate ${body.projectName}`,
    objective: body.prompt,
    kind: "generate",
    projectName: body.projectName,
  });

  try {
    const generation = await generateEffectiveCode(
      context.runtime,
      requestPayload,
    );
    const run = context.services.autocoderPipeline.record({
      workflowId: workflow.workflowId,
      kind: "generate",
      projectName: body.projectName,
      sessionId: workflow.sessionId,
      taskId: workflow.taskId,
      request: requestPayload,
      result: generation,
    });
    completeAutocoderWorkflowContext(
      context,
      workflow.taskId,
      workflow.workflowId,
      "system: code generation completed",
    );

    return json({
      workflowId: workflow.workflowId,
      taskId: workflow.taskId,
      run,
      generation,
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
