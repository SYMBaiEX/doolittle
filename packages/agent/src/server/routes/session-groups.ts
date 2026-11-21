import { ChannelType } from "@elizaos/core";
import type { AppContext } from "../../runtime/bootstrap/types";
import { stableRuntimeUuid } from "../../runtime/stable-runtime-uuid";
import type { SessionRoute } from "../../types/gateway";
import type { SessionSummary } from "../../types/session";

function isSharedRoute(route: SessionRoute): boolean {
  switch (route.platform) {
    case "telegram": {
      const channelType = route.channelType ?? route.metadata?.chatType;
      return channelType === "group" || channelType === "supergroup";
    }
    case "slack": {
      const channelType = route.channelType ?? route.metadata?.channelType;
      return (
        channelType === "channel" ||
        channelType === "group" ||
        channelType === "mpim"
      );
    }
    case "discord":
      return route.channelType === "group" || Boolean(route.metadata?.guildId);
    case "whatsapp":
    case "signal":
      return route.channelType === "group";
    default:
      return false;
  }
}

export async function withConversationKinds(
  context: AppContext,
  summaries: SessionSummary[],
): Promise<SessionSummary[]> {
  if (summaries.length === 0) return summaries;
  const groupIds = new Set<string>();
  try {
    for (const route of context.services.gatewaySessions?.list() ?? []) {
      // The connector's saved route key is the transcript ID. Active session
      // selections can refer to a different conversation.
      if (isSharedRoute(route)) groupIds.add(route.sessionKey);
    }
  } catch {
    // Group labels are optional. A gateway store failure must leave history usable.
  }

  const adapter = context.runtime?.adapter;
  if (adapter?.getRoomsByIds) {
    const sessionIdsByRoom = new Map(
      summaries
        .filter(({ sessionId }) => !groupIds.has(sessionId))
        .map(({ sessionId }) => [stableRuntimeUuid(sessionId), sessionId]),
    );
    try {
      if (sessionIdsByRoom.size > 0) {
        const rooms = await adapter.getRoomsByIds([...sessionIdsByRoom.keys()]);
        for (const room of rooms) {
          if (
            room.type !== ChannelType.GROUP &&
            room.type !== ChannelType.VOICE_GROUP
          )
            continue;
          const sessionId = sessionIdsByRoom.get(room.id);
          if (sessionId) groupIds.add(sessionId);
        }
      }
    } catch {
      // The local transcript database remains usable if Eliza's adapter is down.
    }
  }
  return summaries.map((summary) =>
    groupIds.has(summary.sessionId)
      ? { ...summary, conversationKind: "group" }
      : summary,
  );
}
