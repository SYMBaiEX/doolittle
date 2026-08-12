import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

export async function handleWorkspaceRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/workspace/tree") {
    const depth = Number(url.searchParams.get("depth") ?? "2");
    const snapshot = await context.services.workspace.treeAsync(
      Number.isNaN(depth) ? 2 : depth,
    );
    return json({
      entries: snapshot.entries,
      truncated: snapshot.truncated,
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
      results: await context.services.workspace.search(query),
    });
  }

  if (request.method === "GET" && url.pathname === "/workspace/checkpoints") {
    return json({
      support: await context.services.workspace.checkpointSupport(),
      checkpoints: await context.services.workspace.listCheckpoints(),
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
        {
          checkpoint: await context.services.workspace.createCheckpoint(
            body.label,
          ),
        },
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
    let id = "";
    try {
      id = decodeURIComponent(url.pathname.split("/")[3] ?? "");
    } catch {
      return json({ error: "Checkpoint id contains invalid encoding." }, 400);
    }
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
        checkpoint: await context.services.workspace.restoreCheckpoint(id),
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
