import type { AppContext } from "@/runtime/bootstrap";
import {
  getEffectiveSecret,
  listEffectiveSecretKeys,
  setEffectiveSecret,
} from "@/runtime/native/service-bridge/index";
import {
  completeAutocoderWorkflowContext,
  createAutocoderWorkflowContext,
  failAutocoderWorkflowContext,
} from "@/server/autocoder-workflow-context";
import { json } from "@/server/responses";

export async function handleSecretsRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/secrets") {
    return json({
      keys: await listEffectiveSecretKeys(context.runtime),
    });
  }

  if (request.method === "POST" && url.pathname === "/secrets/get") {
    const body = (await request.json()) as {
      key?: string;
    };
    if (!body.key) {
      return json({ error: "key is required" }, 400);
    }
    return json({
      key: body.key,
      value: await getEffectiveSecret(context.runtime, body.key),
    });
  }

  if (request.method === "POST" && url.pathname === "/secrets/set") {
    const body = (await request.json()) as {
      key?: string;
      value?: string;
    };
    if (!body.key || body.value === undefined) {
      return json({ error: "key and value are required" }, 400);
    }
    const workflow = createAutocoderWorkflowContext(context, {
      title: `Set secret ${body.key}`,
      objective: `Set secret ${body.key}`,
      kind: "secret.set",
    });
    try {
      await setEffectiveSecret(context.runtime, body.key, body.value);
      const run = context.services.autocoderPipeline.record({
        workflowId: workflow.workflowId,
        kind: "secret.set",
        sessionId: workflow.sessionId,
        taskId: workflow.taskId,
        request: { key: body.key, redacted: true },
        result: { key: body.key, valueSet: true },
      });
      completeAutocoderWorkflowContext(
        context,
        workflow.taskId,
        workflow.workflowId,
        "system: secret stored",
      );
      return json({
        workflowId: workflow.workflowId,
        taskId: workflow.taskId,
        run,
        key: body.key,
        valueSet: true,
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
}
