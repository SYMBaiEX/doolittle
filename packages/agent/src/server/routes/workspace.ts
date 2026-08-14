import type { AppContext } from "@/runtime/bootstrap";
import { readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";

type ParsedBody = { body: Record<string, unknown> } | { response: Response };

async function readBody(request: Request): Promise<ParsedBody> {
  const parsed = await readJsonObjectBody(request);
  if (parsed.ok) return { body: parsed.value };
  return {
    response: json(
      {
        error:
          parsed.reason === "invalid_json"
            ? "Invalid JSON body"
            : "JSON body must be an object",
      },
      400,
    ),
  };
}

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
    const parsed = await readBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as {
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
    const parsed = await readBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as {
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
