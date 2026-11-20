import type { AppContext } from "../../../runtime/bootstrap/index";
import { json } from "../../responses";
import { handleHookRoutes } from "./hooks";
import { handleInboundWebhook, readJsonBody } from "./inbound";
import { handlePairingRoutes } from "./pairing";
import { handleProviderWebhookRoute } from "./provider";

export async function handleWebhookRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "POST" && url.pathname === "/webhooks/telegram") {
    const body = await readJsonBody(request);
    if (!body) {
      return json({ error: "Invalid JSON body." }, 400);
    }
    return handleInboundWebhook("telegram", context, body, request.signal);
  }

  if (request.method === "POST" && url.pathname === "/webhooks/discord") {
    const body = await readJsonBody(request);
    if (!body) {
      return json({ error: "Invalid JSON body." }, 400);
    }
    return handleInboundWebhook("discord", context, body, request.signal);
  }

  const providerResponse = await handleProviderWebhookRoute(
    context,
    request,
    url,
  );
  if (providerResponse) return providerResponse;

  if (request.method === "POST" && url.pathname === "/webhooks/signal") {
    return handleInboundWebhook(
      "signal",
      context,
      await readJsonBody(request),
      request.signal,
    );
  }

  if (request.method === "POST" && url.pathname === "/webhooks/matrix") {
    return handleInboundWebhook(
      "matrix",
      context,
      await readJsonBody(request),
      request.signal,
    );
  }

  if (request.method === "POST" && url.pathname === "/webhooks/email") {
    return handleInboundWebhook(
      "email",
      context,
      await readJsonBody(request),
      request.signal,
    );
  }

  if (request.method === "POST" && url.pathname === "/webhooks/sms") {
    return handleInboundWebhook(
      "sms",
      context,
      await readJsonBody(request),
      request.signal,
    );
  }

  if (request.method === "POST" && url.pathname === "/webhooks/mattermost") {
    return handleInboundWebhook(
      "mattermost",
      context,
      await readJsonBody(request),
      request.signal,
    );
  }

  if (request.method === "POST" && url.pathname === "/webhooks/homeassistant") {
    return handleInboundWebhook(
      "homeassistant",
      context,
      await readJsonBody(request),
      request.signal,
    );
  }

  if (request.method === "POST" && url.pathname === "/webhooks/dingtalk") {
    return handleInboundWebhook(
      "dingtalk",
      context,
      await readJsonBody(request),
      request.signal,
    );
  }

  const pairingResponse = await handlePairingRoutes(context, request, url);
  if (pairingResponse) {
    return pairingResponse;
  }

  return handleHookRoutes(context, request, url);
}
