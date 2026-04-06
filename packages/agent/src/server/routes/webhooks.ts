import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeInboundMessage } from "@/gateway/message-normalization/index";
import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import type { PlatformName } from "@/types";

function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret?: string,
): boolean {
  if (!signingSecret) {
    return true;
  }
  if (!timestamp || !signature) {
    return false;
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function handleInboundWebhook(
  platform: Parameters<typeof normalizeInboundMessage>[0],
  context: AppContext,
  body: unknown,
): Promise<Response> {
  const inbound = normalizeInboundMessage(platform, body);
  if (!inbound) {
    return json({ ok: true, ignored: true });
  }
  const result = await context.gateway.receive(inbound);
  return json(result, result.ok ? 200 : 403);
}

export async function handleWebhookRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "POST" && url.pathname === "/webhooks/telegram") {
    const body = (await request.json().catch(() => null)) as unknown;
    if (!body) {
      return json({ error: "Invalid JSON body." }, 400);
    }
    return handleInboundWebhook("telegram", context, body);
  }

  if (request.method === "POST" && url.pathname === "/webhooks/discord") {
    const body = (await request.json().catch(() => null)) as unknown;
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
    const body = (await request.json().catch(() => null)) as unknown;
    if (!body) {
      return json({ error: "Invalid JSON body." }, 400);
    }
    return handleInboundWebhook("whatsapp", context, body);
  }

  if (request.method === "POST" && url.pathname === "/webhooks/signal") {
    const body = (await request.json().catch(() => null)) as unknown;
    return handleInboundWebhook("signal", context, body);
  }

  if (request.method === "POST" && url.pathname === "/webhooks/matrix") {
    const body = (await request.json().catch(() => null)) as unknown;
    return handleInboundWebhook("matrix", context, body);
  }

  if (request.method === "POST" && url.pathname === "/webhooks/email") {
    const body = (await request.json().catch(() => null)) as unknown;
    return handleInboundWebhook("email", context, body);
  }

  if (request.method === "POST" && url.pathname === "/webhooks/sms") {
    const body = (await request.json().catch(() => null)) as unknown;
    return handleInboundWebhook("sms", context, body);
  }

  if (request.method === "POST" && url.pathname === "/webhooks/mattermost") {
    const body = (await request.json().catch(() => null)) as unknown;
    return handleInboundWebhook("mattermost", context, body);
  }

  if (request.method === "POST" && url.pathname === "/webhooks/homeassistant") {
    const body = (await request.json().catch(() => null)) as unknown;
    return handleInboundWebhook("homeassistant", context, body);
  }

  if (request.method === "POST" && url.pathname === "/webhooks/dingtalk") {
    const body = (await request.json().catch(() => null)) as unknown;
    return handleInboundWebhook("dingtalk", context, body);
  }

  if (request.method === "GET" && url.pathname === "/pairing/pending") {
    const platform = url.searchParams.get("platform") as PlatformName | null;
    return json({
      requests: context.services.pairing.listPending(platform ?? undefined),
    });
  }

  if (request.method === "POST" && url.pathname === "/pairing/approve") {
    const body = (await request.json()) as {
      platform: PlatformName;
      code: string;
    };
    return json({
      approved: context.services.pairing.approve(body.platform, body.code),
    });
  }

  if (request.method === "POST" && url.pathname === "/pairing/deny") {
    const body = (await request.json()) as {
      platform: PlatformName;
      code: string;
    };
    return json({
      denied: context.services.pairing.deny(body.platform, body.code),
    });
  }

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
