import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

export async function handleWorkspaceRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/workspace/tree") {
    const depth = Number(url.searchParams.get("depth") ?? "2");
    return json({
      entries: context.services.workspace.tree(Number.isNaN(depth) ? 2 : depth),
    });
  }

  if (request.method === "GET" && url.pathname === "/workspace/read") {
    const path = url.searchParams.get("path");
    if (!path) {
      return json({ error: "path is required" }, 400);
    }
    return json({
      path,
      content: context.services.workspace.read(path),
    });
  }

  if (request.method === "GET" && url.pathname === "/workspace/search") {
    const query = url.searchParams.get("query");
    if (!query) {
      return json({ error: "query is required" }, 400);
    }
    return json({
      results: context.services.workspace.search(query),
    });
  }

  if (request.method === "GET" && url.pathname === "/workspace/checkpoints") {
    return json({
      support: context.services.workspace.checkpointSupport(),
      checkpoints: context.services.workspace.listCheckpoints(),
    });
  }

  if (request.method === "POST" && url.pathname === "/workspace/checkpoints") {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      label?: unknown;
    };
    if (body.label !== undefined && typeof body.label !== "string") {
      return json({ error: "label must be a string" }, 400);
    }
    try {
      return json(
        { checkpoint: context.services.workspace.createCheckpoint(body.label) },
        201,
      );
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to create checkpoint.",
        },
        409,
      );
    }
  }

  if (
    request.method === "POST" &&
    /^\/workspace\/checkpoints\/[^/]+\/restore$/u.test(url.pathname)
  ) {
    const id = decodeURIComponent(url.pathname.split("/")[3] ?? "");
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      confirmCheckpointId?: unknown;
    };
    if (body.confirmCheckpointId !== id) {
      return json(
        {
          error:
            "Restore requires confirmCheckpointId to exactly match the checkpoint id. This overwrites tracked workspace files but does not restart the runtime.",
        },
        400,
      );
    }
    try {
      return json({
        checkpoint: context.services.workspace.restoreCheckpoint(id),
        restored: true,
        runtimeRestarted: false,
      });
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to restore checkpoint.",
        },
        409,
      );
    }
  }

  return null;
}
