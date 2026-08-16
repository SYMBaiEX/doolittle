import { normalizeInboundMessage } from "@/gateway/message-normalization/index";
import { GatewayIngressError } from "@/gateway/receive/ingress-spool";
import type { AppContext } from "@/runtime/bootstrap";
import { json, onResponseCommitted } from "@/server/responses";

export async function readJsonBody(request: Request): Promise<unknown | null> {
  return (await request.json().catch(() => null)) as unknown;
}

export async function handleInboundWebhook(
  platform: Parameters<typeof normalizeInboundMessage>[0],
  context: AppContext,
  body: unknown,
  abortSignal?: AbortSignal,
): Promise<Response> {
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
  platform: Parameters<typeof normalizeInboundMessage>[0],
  context: AppContext,
  body: unknown,
  abortSignal?: AbortSignal,
): Promise<Response> {
  const inbound = normalizeInboundMessage(platform, body);
  if (!inbound) return json({ ok: true, ignored: true });
  if (abortSignal?.aborted) {
    return json({ error: "Request cancelled before inbound acceptance." }, 499);
  }
  try {
    const receipt = context.gateway.acceptInbound(inbound, { abortSignal });
    return onResponseCommitted(json({ ok: true, ...receipt }, 200), () => {
      context.gateway.startIngress();
    });
  } catch (error) {
    if (error instanceof GatewayIngressError) {
      if (error.code === "invalid_identity")
        return json({ error: error.message }, 422);
      if (error.code === "digest_conflict")
        return json({ error: error.message }, 409);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 503,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "retry-after": "1",
        },
      });
    }
    return new Response(
      JSON.stringify({ error: "Inbound acceptance is unavailable." }),
      {
        status: 503,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "retry-after": "1",
        },
      },
    );
  }
}
