import type { RepositoryMutationRequest } from "@doolittle/contracts";
import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

async function readMutationRequest(
  request: Request,
): Promise<RepositoryMutationRequest> {
  const body: unknown = await request.json().catch(() => undefined);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("A repository mutation request object is required.");
  }
  if (!("type" in body) || typeof body.type !== "string") {
    throw new Error("Repository mutation type is required.");
  }
  return body as RepositoryMutationRequest;
}

export async function handleRepositoryRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/repo/status") {
    return json({
      status: await context.services.repository.status(),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/diff") {
    return json({
      diff: await context.services.repository.diffStat(),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/log") {
    return json({
      log: await context.services.repository.recentCommits(),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/summary") {
    return json({
      summary: await context.services.repository.summary(),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/review") {
    return json({
      review: await context.services.repository.review(request.signal),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/changes") {
    return json({
      changes: await context.services.repository.changes(),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/patch") {
    const path = url.searchParams.get("path") ?? undefined;
    const staged = url.searchParams.get("staged") === "true";
    return json({
      patch: await context.services.repository.patch(path, staged),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/worktrees") {
    return json({
      worktrees: await context.services.repository.worktrees(),
    });
  }

  if (request.method === "GET" && url.pathname === "/repo/branches") {
    return json({ branches: await context.services.repository.branches() });
  }

  if (request.method === "GET" && url.pathname === "/repo/remotes") {
    return json({ remotes: await context.services.repository.remotes() });
  }

  if (request.method === "GET" && url.pathname === "/repo/stashes") {
    return json({ stashes: await context.services.repository.stashes() });
  }

  if (request.method === "GET" && url.pathname === "/repo/conflicts") {
    return json({ conflicts: await context.services.repository.conflicts() });
  }

  if (request.method === "POST" && url.pathname === "/repo/mutate") {
    try {
      const mutation = await readMutationRequest(request);
      const result = await context.services.repository.mutate(mutation);
      return json({ result }, result.ok ? 200 : 409);
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid repository mutation.",
        },
        400,
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/repo/worktrees/create") {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      branch?: unknown;
      path?: unknown;
    };
    if (typeof body.branch !== "string" || typeof body.path !== "string") {
      return json({ error: "branch and path are required" }, 400);
    }
    return json(
      {
        worktree: await context.services.repository.createWorktree({
          branch: body.branch,
          path: body.path,
        }),
      },
      201,
    );
  }

  return null;
}
