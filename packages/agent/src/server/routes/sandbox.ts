import type { AppContext } from "@/runtime/bootstrap";
import {
  createEffectiveSandbox,
  executeEffectiveSandboxCode,
  getNativeExecutionControlPlane,
  killEffectiveSandbox,
  listEffectiveSandboxes,
} from "@/runtime/native/service-bridge/index";
import { json } from "@/server/responses";

export async function handleSandboxRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/runtime/e2b") {
    return json({
      e2b: getNativeExecutionControlPlane(context.runtime).e2b,
    });
  }

  if (request.method === "GET" && url.pathname === "/e2b/sandboxes") {
    return json({
      control: getNativeExecutionControlPlane(context.runtime).e2b,
      sandboxes: listEffectiveSandboxes(context.runtime),
    });
  }

  if (request.method === "POST" && url.pathname === "/e2b/sandboxes") {
    const body = (await request.json()) as {
      template?: string;
      metadata?: Record<string, string>;
    };
    return json({
      sandboxId: await createEffectiveSandbox(context.runtime, {
        template: body.template,
        metadata: body.metadata,
      }),
      sandboxes: listEffectiveSandboxes(context.runtime),
    });
  }

  if (request.method === "POST" && url.pathname === "/e2b/execute") {
    const body = (await request.json()) as {
      code?: string;
      language?: string;
    };
    if (!body.code) {
      return json({ error: "code is required" }, 400);
    }
    return json({
      result: await executeEffectiveSandboxCode(
        context.runtime,
        body.code,
        body.language ?? "python",
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/e2b/kill") {
    const body = (await request.json()) as {
      id?: string;
    };
    await killEffectiveSandbox(context.runtime, body.id);
    return json({
      killed: body.id ?? "active",
      sandboxes: listEffectiveSandboxes(context.runtime),
    });
  }

  return null;
}
