import type { AppContext } from "@/runtime/bootstrap";
import { readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";

export async function handleHookRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/hooks") {
    return json({
      hooks: context.services.hooks.list(),
      recentInvocations: context.services.hooks.recentInvocations(),
    });
  }

  if (request.method === "POST" && url.pathname === "/hooks") {
    const parsed = await readJsonObjectBody(request);
    if (!parsed.ok) {
      return json(
        {
          error:
            parsed.reason === "invalid_json"
              ? "Invalid JSON body"
              : "JSON body must be an object",
        },
        400,
      );
    }
    const body = parsed.value;
    if (
      typeof body.event !== "string" ||
      typeof body.name !== "string" ||
      typeof body.template !== "string" ||
      (body.enabled !== undefined && typeof body.enabled !== "boolean")
    ) {
      return json({ error: "event, name, and template are required" }, 400);
    }
    try {
      return json({
        hook: context.services.hooks.add({
          event: body.event,
          name: body.name,
          enabled: body.enabled ?? true,
          template: body.template,
        }),
      });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : String(error) },
        400,
      );
    }
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/hooks/")) {
    const id = url.pathname.replace("/hooks/", "");
    context.services.hooks.remove(id);
    return json({ ok: true });
  }

  return null;
}
