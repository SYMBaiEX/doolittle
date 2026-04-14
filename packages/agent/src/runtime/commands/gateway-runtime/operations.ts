import {
  parseGatewayFiltersFromText,
  parseTransportPlatform,
} from "@/gateway/control/index";
import type { PlatformName } from "@/types/gateway";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";
import {
  describeGatewayRuntimeSnapshot,
  renderGatewayOperatorBlock,
} from "./readouts/shared";

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
    const records = await context.gateway.watchdog(reason);
    const snapshot = describeGatewayRuntimeSnapshot(context);
    return renderGatewayOperatorBlock(
      "Gateway Watchdog",
      [
        `Reason: ${reason}`,
        `Records: ${records.length}`,
        `Daemon: ${snapshot.daemonRunning ? "running" : "stopped"}`,
        `Operational transports: ${snapshot.operational}/${snapshot.configured}`,
      ],
      [
        "Use `/gateway supervision` to review accumulated supervision records.",
        "Run `/gateway readiness` if the watchdog reported repeated instability.",
      ],
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
    const records = await context.gateway.watch(platform, reason);
    return renderGatewayOperatorBlock(
      "Gateway Watch",
      [
        `Target: ${platform}`,
        `Reason: ${reason}`,
        `Records: ${records.length}`,
      ],
      [
        "Run `/gateway readiness` to confirm the transport state after watch operations.",
      ],
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
    const records = await context.gateway.restart(platform, reason);
    return renderGatewayOperatorBlock(
      "Gateway Restart",
      [
        `Target: ${platform}`,
        `Reason: ${reason}`,
        `Records: ${records.length}`,
      ],
      [
        "Re-run `/gateway readiness` before assuming the restart fixed delivery.",
      ],
    );
  }

  if (trimmed === "/gateway supervision") {
    if (!context.gateway) {
      return gatewayUnavailableMessage();
    }
    const records = context.gateway.supervision(50);
    const snapshot = describeGatewayRuntimeSnapshot(context);
    return renderGatewayOperatorBlock(
      "Gateway Supervision",
      [
        `Records: ${records.length}`,
        `Daemon: ${snapshot.daemonRunning ? "running" : "stopped"}`,
        `Operational transports: ${snapshot.operational}/${snapshot.configured}`,
        ...(records[0]
          ? [`Latest: ${JSON.stringify(records[0])}`]
          : ["Latest: none"]),
      ],
      [
        "Use `/gateway trace` for message-level history after supervision events.",
      ],
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
    return renderGatewayOperatorBlock(
      "Gateway Edit",
      [
        `Delivery: ${left}`,
        `Text length: ${text.length}`,
        `Result: ${JSON.stringify(updated)}`,
      ],
      ["Use `/gateway deliveries` to inspect the updated outbound record."],
    );
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
    return renderGatewayOperatorBlock(
      "Gateway Progressive Delivery",
      [
        `Target: ${platform} ${roomId}`,
        `Parts: ${parts.length}`,
        `Result: ${JSON.stringify(delivery)}`,
      ],
      ["Use `/gateway deliveries` to inspect the resulting delivery record."],
    );
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
    const history = await context.gateway.history(filters.limit ?? 20, filters);
    const traces = history.traces ?? [];
    const inbox = history.inbox ?? [];
    const outbox = history.outbox ?? [];
    const attachments = history.attachments ?? [];
    const deliveries = history.deliveries ?? [];
    const totals = history.state?.totals;
    return renderGatewayOperatorBlock(
      "Gateway History",
      [
        `Records: traces=${traces.length} inbox=${inbox.length} outbox=${outbox.length} attachments=${attachments.length} deliveries=${deliveries.length}`,
        `State totals: configured=${totals?.configuredPlatforms ?? 0} ready=${totals?.readyAdapters ?? 0} traces=${totals?.totalTraces ?? traces.length} inbox=${totals?.inboxMessages ?? inbox.length} outbox=${totals?.outboxMessages ?? outbox.length}`,
        ...(deliveries[0]
          ? [`Latest delivery: ${deliveries[0].id}`]
          : []),
        ...(traces[0]
          ? [`Latest trace: ${traces[0].traceId ?? "n/a"}`]
          : []),
      ],
      [
        "Use `/gateway trace` for event-by-event history.",
        "Use `/gateway deliveries` for outbound message records.",
        "Use `GET /gateway/history` if you need the raw structured payload.",
      ],
    );
  }

  return undefined;
}
