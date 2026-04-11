import type { AppContext } from "@/runtime/bootstrap";
import {
  getEffectiveShellHistory,
  getNativeResearchControlPlane,
  runEffectiveShellCommand,
} from "@/runtime/native/service-bridge/index";
import { json } from "@/server/responses";

export async function handleOperationsRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/runtime/research") {
    return json({
      research: getNativeResearchControlPlane(context.runtime),
    });
  }

  if (request.method === "POST" && url.pathname === "/workspace/write") {
    const body = (await request.json()) as {
      path?: string;
      content?: string;
    };
    if (!body.path || body.content === undefined) {
      return json({ error: "path and content are required" }, 400);
    }
    return json({
      path: context.services.workspace.write(body.path, body.content),
    });
  }

  if (request.method === "GET" && url.pathname === "/deliveries") {
    return json({
      deliveries: context.services.delivery.recent(100),
    });
  }

  if (request.method === "GET" && url.pathname === "/terminal/history") {
    return json({
      commands: getEffectiveShellHistory(context.runtime, context.services, 25),
    });
  }

  if (request.method === "POST" && url.pathname === "/terminal/run") {
    const body = (await request.json()) as {
      command?: string;
      timeoutMs?: number;
    };
    if (!body.command) {
      return json({ error: "command is required" }, 400);
    }
    return json({
      result: await runEffectiveShellCommand(
        context.runtime,
        context.services,
        body.command,
      ),
    });
  }

  return null;
}
