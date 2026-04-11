import {
  parseGatewayFiltersFromText,
  parseTransportPlatform,
} from "@/gateway/control/index";
import type { PlatformName } from "@/types/gateway";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";

function gatewayUnavailableMessage(): string {
  return "Gateway runtime is not attached to this execution context.";
}

export async function handleGatewayRuntimeOperationCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed.startsWith("/gateway watchdog")) {
    if (!context.gateway) {
      return gatewayUnavailableMessage();
    }
    const reason = trimmed.replace("/gateway watchdog", "").trim() || "cli";
    return JSON.stringify(
      {
        reason,
        records: await context.gateway.watchdog(reason),
        runtime: context.gateway.runtimeStatus(),
      },
      null,
      2,
    );
  }

  if (trimmed === "/gateway watch" || trimmed.startsWith("/gateway watch ")) {
    if (!context.gateway) {
      return gatewayUnavailableMessage();
    }
    const payload = trimmed.replace("/gateway watch", "").trim();
    const [candidate, ...reasonParts] = payload.split(/\s+/u);
    const platform =
      candidate === "all" || !candidate
        ? "all"
        : (parseTransportPlatform(candidate) ?? "all");
    const reason = reasonParts.join(" ").trim() || "cli";
    return JSON.stringify(
      {
        platform,
        reason,
        records: await context.gateway.watch(platform, reason),
        runtime: context.gateway.runtimeStatus(),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/gateway restart")) {
    if (!context.gateway) {
      return gatewayUnavailableMessage();
    }
    const payload = trimmed.replace("/gateway restart", "").trim();
    const [candidate, ...reasonParts] = payload.split(/\s+/u);
    const platform =
      candidate === "all" || !candidate
        ? "all"
        : (parseTransportPlatform(candidate) ?? "all");
    const reason = reasonParts.join(" ").trim() || "cli";
    return JSON.stringify(
      {
        platform,
        reason,
        records: await context.gateway.restart(platform, reason),
        runtime: context.gateway.runtimeStatus(),
      },
      null,
      2,
    );
  }

  if (trimmed === "/gateway supervision") {
    if (!context.gateway) {
      return gatewayUnavailableMessage();
    }
    return JSON.stringify(
      {
        runtime: context.gateway.runtimeStatus(),
        records: context.gateway.supervision(50),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/gateway edit ")) {
    if (!context.gateway) {
      return gatewayUnavailableMessage();
    }
    const payload = trimmed.replace("/gateway edit ", "").trim();
    const [left, text] = payload.split("::").map((part) => part.trim());
    if (!left || !text) {
      return "Usage: /gateway edit <delivery-id> :: <text>";
    }
    const updated = await context.gateway.editDelivery(left, text);
    return JSON.stringify(updated, null, 2);
  }

  if (trimmed.startsWith("/gateway progressive ")) {
    if (!context.gateway) {
      return gatewayUnavailableMessage();
    }
    const payload = trimmed.replace("/gateway progressive ", "").trim();
    const [left, right] = payload.split("::").map((part) => part.trim());
    if (!left || !right) {
      return "Usage: /gateway progressive <platform> <room-id> :: <part-one> => <part-two> [=> <part-three>]";
    }
    const [platform, roomId] = left.split(/\s+/u);
    if (!platform || !roomId) {
      return "Usage: /gateway progressive <platform> <room-id> :: <part-one> => <part-two> [=> <part-three>]";
    }
    const parts = right
      .split("=>")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 2) {
      return "Progressive delivery requires at least two message parts.";
    }
    const delivery = await context.gateway.sendProgressive(
      {
        platform: platform as PlatformName,
        roomId,
        userId: input.userId,
      },
      parts,
    );
    return JSON.stringify(delivery, null, 2);
  }

  if (trimmed === "/gateway trace" || trimmed.startsWith("/gateway trace ")) {
    if (!context.gateway) {
      return gatewayUnavailableMessage();
    }
    const filters = parseGatewayFiltersFromText(
      trimmed.replace("/gateway trace", "").trim(),
    );
    const traces = context.gateway.trace(filters.limit ?? 20, filters);
    return traces.length
      ? traces
          .map(
            (trace) =>
              `- [${trace.kind}] ${trace.platform} ${trace.detail}\n  trace=${trace.traceId} session=${trace.sessionId ?? "n/a"} delivery=${trace.deliveryId ?? "n/a"}${trace.messageId ? ` message=${trace.messageId}` : ""}${trace.threadId ? ` thread=${trace.threadId}` : ""}${trace.replyToMessageId ? ` replyTo=${trace.replyToMessageId}` : ""}`,
          )
          .join("\n\n")
      : "No gateway traces recorded.";
  }

  if (
    trimmed === "/gateway deliveries" ||
    trimmed.startsWith("/gateway deliveries ")
  ) {
    if (!context.gateway) {
      return gatewayUnavailableMessage();
    }
    const filters = parseGatewayFiltersFromText(
      trimmed.replace("/gateway deliveries", "").trim(),
    );
    const history = await context.gateway.history(filters.limit ?? 20, filters);
    const deliveries = history.deliveries;
    return deliveries.length
      ? deliveries
          .map(
            (delivery) =>
              `- ${delivery.id} ${delivery.target.platform} -> ${delivery.target.channelId ?? delivery.target.userId ?? "n/a"} [${delivery.target.mode}]${delivery.threadId ? ` thread=${delivery.threadId}` : ""}${delivery.replyToId ? ` replyTo=${delivery.replyToId}` : ""}\n  ${delivery.text.slice(0, 180)}${delivery.metadata && Object.keys(delivery.metadata).length ? `\n  metadata=${JSON.stringify(delivery.metadata)}` : ""}`,
          )
          .join("\n\n")
      : "No delivery records found.";
  }

  if (
    trimmed === "/gateway history" ||
    trimmed.startsWith("/gateway history ")
  ) {
    if (!context.gateway) {
      return gatewayUnavailableMessage();
    }
    const filters = parseGatewayFiltersFromText(
      trimmed.replace("/gateway history", "").trim(),
    );
    return JSON.stringify(
      await context.gateway.history(filters.limit ?? 20, filters),
      null,
      2,
    );
  }

  return undefined;
}
