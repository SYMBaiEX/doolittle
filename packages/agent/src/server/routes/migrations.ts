import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

export async function handleMigrationRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/migrate/sources") {
    return json({
      sources: context.services.operator.migrationSources(),
    });
  }

  if (request.method === "GET" && url.pathname === "/migrate/history") {
    const limitRaw = Number(url.searchParams.get("limit") ?? "20");
    return json({
      history: context.services.operator.migrationHistory(
        Number.isNaN(limitRaw) || limitRaw <= 0 ? 20 : limitRaw,
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/migrate/inspect") {
    const sourcePath = url.searchParams.get("path");
    if (!sourcePath) {
      return json({ error: "path is required" }, 400);
    }
    return json({
      inspection: context.services.operator.inspectMigrationSource(sourcePath),
    });
  }

  if (request.method === "POST" && url.pathname === "/migrate/apply") {
    const body = (await request.json()) as {
      path?: string;
      overwrite?: boolean;
    };
    if (!body.path) {
      return json({ error: "path is required" }, 400);
    }
    return json({
      result: context.services.operator.applyMigration(body.path, {
        overwrite: body.overwrite,
      }),
    });
  }

  return null;
}
