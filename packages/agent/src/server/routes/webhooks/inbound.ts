import { normalizeInboundMessage } from "@/gateway/message-normalization/index";
import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

export async function readJsonBody(request: Request): Promise<unknown | null> {
  return (await request.json().catch(() => null)) as unknown;
}

export async function handleInboundWebhook(
  platform: Parameters<typeof normalizeInboundMessage>[0],
  context: AppContext,
  body: unknown,
): Promise<Response> {
  const inbound = normalizeInboundMessage(platform, body);
  if (!inbound) {
    return json({ ok: true, ignored: true });
  }
  const result = await context.gateway.receive(inbound);
  const status = result.ok
    ? 200
    : result.agentCompleted && result.deliveryStatus === "rejected"
      ? 202
      : 403;
  return json(result, status);
}
