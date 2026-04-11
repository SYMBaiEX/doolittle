import { parseGatewayFiltersFromUrl } from "@/gateway/control/index";
import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import { buildGatewayJournalResponse } from "./responses";

export async function handleGatewayHistoryRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/gateway/trace") {
    const filters = parseGatewayFiltersFromUrl(url);
    const history = await context.gateway.history(filters.limit, filters);
    return json({
      traces: history.traces,
      state: history.state,
    });
  }

  if (request.method === "GET" && url.pathname === "/gateway/deliveries") {
    const filters = parseGatewayFiltersFromUrl(url);
    const history = await context.gateway.history(filters.limit, filters);
    return json({
      deliveries: history.deliveries,
      state: history.state,
    });
  }

  if (request.method === "GET" && url.pathname === "/gateway/inbox") {
    const filters = parseGatewayFiltersFromUrl(url);
    return json({
      inbox: context.gateway.inbox(filters.limit, filters),
      state: await context.gateway.state(filters.limit, filters),
    });
  }

  if (request.method === "GET" && url.pathname === "/gateway/outbox") {
    const filters = parseGatewayFiltersFromUrl(url);
    return json({
      outbox: context.gateway.outbox(filters.limit, filters),
      state: await context.gateway.state(filters.limit, filters),
    });
  }

  if (request.method === "GET" && url.pathname === "/gateway/attachments") {
    const filters = parseGatewayFiltersFromUrl(url);
    return json({
      attachments: context.gateway.attachments(filters.limit, filters),
      state: await context.gateway.state(filters.limit, filters),
    });
  }

  if (request.method === "GET" && url.pathname === "/gateway/history") {
    const filters = parseGatewayFiltersFromUrl(url);
    return json({
      history: await context.gateway.history(filters.limit, filters),
    });
  }

  if (request.method === "GET" && url.pathname === "/gateway/state") {
    const filters = parseGatewayFiltersFromUrl(url);
    return json({
      state: await context.gateway.state(filters.limit, filters),
    });
  }

  if (request.method === "GET" && url.pathname === "/gateway/supervision") {
    return json({
      records: context.gateway.supervision(
        Number(url.searchParams.get("limit") ?? "25"),
      ),
      runtime: context.gateway.runtimeStatus(),
    });
  }

  if (request.method === "GET" && url.pathname === "/gateway/journal") {
    return json(await buildGatewayJournalResponse(context, url));
  }

  return null;
}
