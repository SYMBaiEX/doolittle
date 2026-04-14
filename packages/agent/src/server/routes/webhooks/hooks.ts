import type { AppContext } from "@/runtime/bootstrap";
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
    const body = (await request.json()) as {
      event: string;
      name: string;
      enabled?: boolean;
      template: string;
    };
    return json({
      hook: context.services.hooks.add({
        event: body.event,
        name: body.name,
        enabled: body.enabled ?? true,
        template: body.template,
      }),
    });
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/hooks/")) {
    const id = url.pathname.replace("/hooks/", "");
    context.services.hooks.remove(id);
    return json({ ok: true });
  }

  return null;
}
