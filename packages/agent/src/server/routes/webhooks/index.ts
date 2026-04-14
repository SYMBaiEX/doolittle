import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import { handleHookRoutes } from "./hooks";
import { handleInboundWebhook, readJsonBody } from "./inbound";
import { handlePairingRoutes } from "./pairing";
import { verifySlackSignature } from "./signature";

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
    return handleInboundWebhook("telegram", context, body);
  }

  if (request.method === "POST" && url.pathname === "/webhooks/discord") {
    const body = await readJsonBody(request);
    if (!body) {
      return json({ error: "Invalid JSON body." }, 400);
    }
    return handleInboundWebhook("discord", context, body);
  }

  if (request.method === "POST" && url.pathname === "/webhooks/slack") {
    const rawBody = await request.text();
    if (
      !verifySlackSignature(
        rawBody,
        request.headers.get("x-slack-request-timestamp"),
        request.headers.get("x-slack-signature"),
        context.config.slackSigningSecret,
      )
    ) {
      return json({ error: "Invalid Slack signature." }, 403);
    }

    let body: {
      challenge?: string;
      event?: unknown;
    };
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    if (body.challenge) {
      return json({ challenge: body.challenge });
    }
    return handleInboundWebhook("slack", context, body);
  }

  if (request.method === "GET" && url.pathname === "/webhooks/whatsapp") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (
      mode === "subscribe" &&
      token &&
      challenge &&
      token === context.config.whatsappVerifyToken
    ) {
      return new Response(challenge, { status: 200 });
    }
    return json({ error: "WhatsApp verification failed." }, 403);
  }

  if (request.method === "POST" && url.pathname === "/webhooks/whatsapp") {
    const body = await readJsonBody(request);
    if (!body) {
      return json({ error: "Invalid JSON body." }, 400);
    }
    return handleInboundWebhook("whatsapp", context, body);
  }

  if (request.method === "POST" && url.pathname === "/webhooks/signal") {
    return handleInboundWebhook("signal", context, await readJsonBody(request));
  }

  if (request.method === "POST" && url.pathname === "/webhooks/matrix") {
    return handleInboundWebhook("matrix", context, await readJsonBody(request));
  }

  if (request.method === "POST" && url.pathname === "/webhooks/email") {
    return handleInboundWebhook("email", context, await readJsonBody(request));
  }

  if (request.method === "POST" && url.pathname === "/webhooks/sms") {
    return handleInboundWebhook("sms", context, await readJsonBody(request));
  }

  if (request.method === "POST" && url.pathname === "/webhooks/mattermost") {
    return handleInboundWebhook(
      "mattermost",
      context,
      await readJsonBody(request),
    );
  }

  if (request.method === "POST" && url.pathname === "/webhooks/homeassistant") {
    return handleInboundWebhook(
      "homeassistant",
      context,
      await readJsonBody(request),
    );
  }

  if (request.method === "POST" && url.pathname === "/webhooks/dingtalk") {
    return handleInboundWebhook(
      "dingtalk",
      context,
      await readJsonBody(request),
    );
  }

  const pairingResponse = await handlePairingRoutes(context, request, url);
  if (pairingResponse) {
    return pairingResponse;
  }

  return handleHookRoutes(context, request, url);
}
