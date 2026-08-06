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

    const workflow = await createAutocoderWorkflowContext(context, {
      title: `Plan repo creation ${body.name}`,
      objective: `Plan GitHub repository creation for ${body.name}`,
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
      await completeAutocoderWorkflowContext(
        context,
        workflow.taskId,
        workflow.workflowId,
        "system: repository creation planned; no mutation executed",
      );
      return json({
        workflowId: workflow.workflowId,
        taskId: workflow.taskId,
        run,
        repository,
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
  }

  if (url.pathname === "/github/delete") {
    const body = (await request.json()) as {
      name?: string;
    };
    if (!body.name) {
      return json({ error: "name is required" }, 400);
    }
    const workflow = await createAutocoderWorkflowContext(context, {
      title: `Plan repo deletion ${body.name}`,
      objective: `Plan GitHub repository deletion for ${body.name}`,
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
      await completeAutocoderWorkflowContext(
        context,
        workflow.taskId,
        workflow.workflowId,
        "system: repository deletion planned; no mutation executed",
      );
      return json({
        workflowId: workflow.workflowId,
        taskId: workflow.taskId,
        run,
        deleted,
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
  }

  return null;
};
