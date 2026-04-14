import {
  createEffectiveRepository,
  deleteEffectiveRepository,
} from "@/runtime/native/service-bridge/autocoder";
import {
  completeAutocoderWorkflowContext,
  createAutocoderWorkflowContext,
  failAutocoderWorkflowContext,
} from "@/server/autocoder-workflow-context";
import { json } from "@/server/responses";
import type { CodegenRouteHandler } from "@/server/routes/codegen/types";

export const handleCodegenGithubRoutes: CodegenRouteHandler = async (
  context,
  request,
  url,
) => {
  if (request.method !== "POST") {
    return null;
  }
  if (url.pathname === "/github/create") {
    const body = (await request.json()) as {
      name?: string;
      private?: boolean;
    };
    if (!body.name) {
      return json({ error: "name is required" }, 400);
    }

    const workflow = createAutocoderWorkflowContext(context, {
      title: `Create repo ${body.name}`,
      objective: `Create GitHub repository ${body.name}`,
      kind: "github.create",
      repositoryName: body.name,
    });

    try {
      const repository = await createEffectiveRepository(
        context.runtime,
        body.name,
        body.private ?? true,
      );
      const run = context.services.autocoderPipeline.record({
        workflowId: workflow.workflowId,
        kind: "github.create",
        repositoryName: body.name,
        sessionId: workflow.sessionId,
        taskId: workflow.taskId,
        request: { name: body.name, private: body.private ?? true },
        result: repository,
      });
      completeAutocoderWorkflowContext(
        context,
        workflow.taskId,
        workflow.workflowId,
        "system: repository created",
      );
      return json({
        workflowId: workflow.workflowId,
        taskId: workflow.taskId,
        run,
        repository,
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
  }

  if (url.pathname === "/github/delete") {
    const body = (await request.json()) as {
      name?: string;
    };
    if (!body.name) {
      return json({ error: "name is required" }, 400);
    }
    const workflow = createAutocoderWorkflowContext(context, {
      title: `Delete repo ${body.name}`,
      objective: `Delete GitHub repository ${body.name}`,
      kind: "github.delete",
      repositoryName: body.name,
    });

    try {
      const deleted = await deleteEffectiveRepository(
        context.runtime,
        body.name,
      );
      const run = context.services.autocoderPipeline.record({
        workflowId: workflow.workflowId,
        kind: "github.delete",
        repositoryName: body.name,
        sessionId: workflow.sessionId,
        taskId: workflow.taskId,
        request: { name: body.name },
        result: deleted,
      });
      completeAutocoderWorkflowContext(
        context,
        workflow.taskId,
        workflow.workflowId,
        "system: repository deleted",
      );
      return json({
        workflowId: workflow.workflowId,
        taskId: workflow.taskId,
        run,
        deleted,
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
  }

  return null;
};
