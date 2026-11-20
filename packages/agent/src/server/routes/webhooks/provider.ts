import { tokenMatches } from "@elizaos/agent/api/server-helpers-auth";
import type { AppContext } from "../../../runtime/bootstrap/index";
import { isProviderAuthenticatedWebhookRequest } from "../../auth";
import { json } from "../../responses";
import {
  type DurableInboundContext,
  handleDurableInboundWebhook,
} from "./inbound";
import { verifySlackSignature, verifyWhatsAppSignature } from "./signature";

export interface ProviderWebhookContext extends DurableInboundContext {
  config: Pick<
    AppContext["config"],
    "slackSigningSecret" | "whatsappAppSecret" | "whatsappVerifyToken"
  >;
}

/** Only these provider callbacks may be served without an owner capability. */
export async function handleProviderWebhookRoute(
  context: ProviderWebhookContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (!isProviderAuthenticatedWebhookRequest(url.pathname, request.method))
    return null;

  if (request.method === "GET") {
    const mode = url.searchParams.getAll("hub.mode");
    const token = url.searchParams.getAll("hub.verify_token");
    const challenge = url.searchParams.getAll("hub.challenge");
    const expected = context.config.whatsappVerifyToken;
    if (
      mode.length === 1 &&
      mode[0] === "subscribe" &&
      token.length === 1 &&
      token[0] &&
      expected &&
      challenge.length === 1 &&
      challenge[0] &&
      tokenMatches(expected, token[0])
    ) {
      return new Response(challenge[0]);
    }
    return json({ error: "WhatsApp verification failed." }, 403);
  }

  const slack = url.pathname === "/webhooks/slack";
  const secret = slack
    ? context.config.slackSigningSecret
    : context.config.whatsappAppSecret;
  const provider = slack ? "Slack" : "WhatsApp";
  if (!secret) {
    return json(
      { error: `${provider} signature verification is not configured.` },
      503,
    );
  }
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const valid = slack
    ? verifySlackSignature(
        rawBody,
        request.headers.get("x-slack-request-timestamp"),
        request.headers.get("x-slack-signature"),
        secret,
      )
    : verifyWhatsAppSignature(
        rawBody,
        request.headers.get("x-hub-signature-256"),
        secret,
      );
  if (!valid) return json({ error: `Invalid ${provider} signature.` }, 403);

  let body: unknown;
  try {
    body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    );
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  if (
    slack &&
    body &&
    typeof body === "object" &&
    "challenge" in body &&
    typeof body.challenge === "string" &&
    body.challenge
  ) {
    return json({ challenge: body.challenge });
  }
  return handleDurableInboundWebhook(
    slack ? "slack" : "whatsapp",
    context,
    body,
    request.signal,
  );
}
