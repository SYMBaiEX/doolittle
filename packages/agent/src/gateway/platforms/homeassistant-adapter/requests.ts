import { randomUUID } from "node:crypto";
import type { OutboundPlatformMessage, PlatformName } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";

type HomeAssistantConnection = {
  apiRoot: string;
  token: string;
};

export function requireHomeAssistantConfig(
  config: EnvConfig,
  missingDetail: string,
  fail: (detail: string) => never,
): HomeAssistantConnection {
  if (!config.homeAssistantUrl || !config.homeAssistantToken) {
    return fail(missingDetail);
  }

  return {
    apiRoot: config.homeAssistantUrl.replace(/\/$/u, ""),
    token: config.homeAssistantToken,
  };
}

export async function watchHomeAssistantStates(
  connection: HomeAssistantConnection,
): Promise<{
  watchedAt: string;
  count: number;
  summary: string;
}> {
  const watchedAt = new Date().toISOString();
  const response = await fetch(`${connection.apiRoot}/api/states`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${connection.token}`,
      "content-type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Home Assistant watch failed (${response.status}): ${await response.text()}`,
    );
  }

  const payload = (await response.json().catch(() => [])) as Array<{
    entity_id?: string;
  }>;
  const count = Array.isArray(payload) ? payload.length : 0;
  const sample = (Array.isArray(payload) ? payload : [])
    .slice(0, 3)
    .map((entry) => entry.entity_id ?? "unknown")
    .join(", ");
  return {
    watchedAt,
    count,
    summary: `Observed ${count} Home Assistant states${sample ? ` (${sample})` : ""}.`,
  };
}

export function sendHomeAssistantNotification(
  connection: HomeAssistantConnection,
  platform: PlatformName,
  message: OutboundPlatformMessage,
): Promise<Response> {
  return fetch(`${connection.apiRoot}/api/services/notify/eliza_agent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: message.text,
      title: platform,
      data: {
        channel: message.roomId,
        user_id: message.userId,
        thread_id: message.threadId,
        reply_to_id: message.replyToId,
        metadata: message.metadata,
        event_id: randomUUID(),
      },
    }),
  });
}
