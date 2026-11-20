import { normalizeInboundMessage } from "../../../gateway/message-normalization/index";
import { parseWhatsAppMessages } from "../../../gateway/message-normalization/parser-media-platforms";
import {
  GatewayIngressError,
  type GatewayIngressReceipt,
} from "../../../gateway/receive/ingress-spool";
import type { AppContext } from "../../../runtime/bootstrap/index";
import { json, onResponseCommitted } from "../../responses";

export async function readJsonBody(request: Request): Promise<unknown | null> {
  return (await request.json().catch(() => null)) as unknown;
}

function isJsonObject(body: unknown): body is Record<string, unknown> {
  return Boolean(body && typeof body === "object" && !Array.isArray(body));
}

export async function handleInboundWebhook(
  platform: Parameters<typeof normalizeInboundMessage>[0],
  context: AppContext,
  body: unknown,
  abortSignal?: AbortSignal,
): Promise<Response> {
  if (!isJsonObject(body)) return json({ error: "Invalid JSON body." }, 400);
  const inbound = normalizeInboundMessage(platform, body);
  if (!inbound) {
    return json({ ok: true, ignored: true });
  }
  const result = await context.gateway.receive(inbound, { abortSignal });
  const status = result.ok
    ? 200
    : result.agentCompleted && result.deliveryStatus === "rejected"
      ? 202
      : 403;
  return json(result, status);
}

export async function handleDurableInboundWebhook(
  platform: "slack" | "whatsapp",
  context: AppContext,
  body: unknown,
  abortSignal?: AbortSignal,
): Promise<Response> {
  if (!isJsonObject(body)) return json({ error: "Invalid JSON body." }, 400);
  if (abortSignal?.aborted) {
    return json({ error: "Request cancelled before inbound acceptance." }, 499);
  }
  const inbound =
    platform === "whatsapp"
      ? parseWhatsAppMessages(body)
      : [normalizeInboundMessage(platform, body)];
  const receipts: GatewayIngressReceipt[] = [];
  const finish = (response: Response) =>
    receipts.length
      ? onResponseCommitted(response, () => context.gateway.startIngress())
      : response;
  try {
    for (const message of inbound) {
      if (!message) continue;
      receipts.push(context.gateway.acceptInbound(message, { abortSignal }));
    }
    if (!receipts.length) return json({ ok: true, ignored: true });
    return finish(
      json({
        ok: true,
        ...receipts[0],
        ...(receipts.length > 1 ? { receipts } : {}),
      }),
    );
  } catch (error) {
    if (error instanceof GatewayIngressError) {
      if (error.code === "invalid_identity")
        return finish(json({ error: error.message }, 422));
      if (error.code === "digest_conflict")
        return finish(json({ error: error.message }, 409));
    }
    const response = json(
      {
        error:
          error instanceof GatewayIngressError
            ? error.message
            : "Inbound acceptance is unavailable.",
      },
      503,
    );
    response.headers.set("retry-after", "1");
    return finish(response);
  }
}
