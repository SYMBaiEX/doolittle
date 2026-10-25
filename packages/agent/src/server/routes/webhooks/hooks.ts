import type { AppContext } from "../../../runtime/bootstrap/index";
import { resolveHookEventBinding } from "../../../services/hook-projection-service";
import { readJsonObjectBody } from "../../request-body";
import { json } from "../../responses";

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
      resolveHookEventBinding(body.event);
    } catch {
      return json({ error: "Unsupported hook event." }, 400);
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
    } catch {
      return json({ error: "Hook could not be created." }, 500);
    }
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/hooks/")) {
    const id = url.pathname.replace("/hooks/", "");
    context.services.hooks.remove(id);
    return json({ ok: true });
  }

  return null;
}
