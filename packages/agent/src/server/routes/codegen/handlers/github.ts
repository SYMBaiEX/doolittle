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
import {
  executeTrackedAutocoderRun,
  isAutocoderCancellation,
} from "@/server/routes/codegen/run-execution";
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
      const { run, result: repository } = await executeTrackedAutocoderRun(
        context,
        {
          workflowId: workflow.workflowId,
          kind: "github.create",
          repositoryName: body.name,
          sessionId: workflow.sessionId,
          taskId: workflow.taskId,
          request: { name: body.name, private: body.private ?? true },
        },
        () =>
          createEffectiveRepository(
            context.runtime,
            body.name as string,
            body.private ?? true,
          ),
      );
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
      const { run, result: deleted } = await executeTrackedAutocoderRun(
        context,
        {
          workflowId: workflow.workflowId,
          kind: "github.delete",
          repositoryName: body.name,
          sessionId: workflow.sessionId,
          taskId: workflow.taskId,
          request: { name: body.name },
        },
        () => deleteEffectiveRepository(context.runtime, body.name as string),
      );
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
  }

  return null;
};
