import { getAgentEventService } from "@elizaos/autonomous/runtime/agent-event-service";
import { type AgentRuntime, EventType } from "@elizaos/core";
import { formatError } from "@/runtime/bootstrap/recovery/error-format";
import type { AppServices } from "@/services";

export type RuntimePayload = unknown;
export interface RuntimeEventPayload {
  eventType: string;
  payload: RuntimePayload;
  roomId?: string;
}

export function eventRoomId(payload: RuntimePayload): string | undefined {
  if (
    payload &&
    typeof payload === "object" &&
    "roomId" in payload &&
    typeof (payload as { roomId?: unknown }).roomId === "string"
  ) {
    return (payload as { roomId: string }).roomId;
  }
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof (payload as { message?: { roomId?: unknown } }).message?.roomId ===
      "string"
  ) {
    return (payload as { message: { roomId: string } }).message.roomId;
  }
  return undefined;
}

export function eventActionLabel(payload: RuntimePayload): string | undefined {
  if (
    payload &&
    typeof payload === "object" &&
    "content" in payload &&
    payload.content &&
    typeof payload.content === "object"
  ) {
    const content = payload.content as {
      actions?: unknown;
      text?: unknown;
      actionStatus?: unknown;
    };
    if (
      Array.isArray(content.actions) &&
      typeof content.actions[0] === "string"
    ) {
      return content.actions[0];
    }
    if (typeof content.text === "string" && content.text.trim()) {
      return content.text.trim();
    }
    if (
      typeof content.actionStatus === "string" &&
      content.actionStatus.trim()
    ) {
      return content.actionStatus.trim();
    }
  }
  return undefined;
}

export function agentEventLabel(
  data: Record<string, unknown>,
): string | undefined {
  if (typeof data.label === "string" && data.label.trim()) {
    return data.label.trim();
  }
  if (typeof data.preview === "string" && data.preview.trim()) {
    return data.preview.trim();
  }
  if (typeof data.text === "string" && data.text.trim()) {
    return data.text.trim();
  }
  return eventActionLabel(data);
}

export function attachRunProgressBridge(
  runtime: AgentRuntime,
  services: AppServices,
): void {
  const register = (
    event: string,
    handler: (payload: RuntimePayload) => void | Promise<void>,
  ) => {
    runtime.registerEvent(event, async (payload) => {
      await handler(payload);
    });
  };

  register(EventType.RUN_STARTED, async (payload) => {
    const roomId = eventRoomId(payload);
    if (roomId) {
      services.runController.updateRuntimeThinking(roomId);
    }
  });

  register(EventType.RUN_ENDED, async (payload) => {
    const roomId = eventRoomId(payload);
    if (!roomId) {
      return;
    }
    const status =
      payload &&
      typeof payload === "object" &&
      "status" in payload &&
      (payload.status === "completed" || payload.status === "timeout")
        ? "complete"
        : "error";
    const errorMessage =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error
        ? formatError(payload.error)
        : undefined;
    services.runController.finishRuntimeRun(roomId, status, errorMessage);
  });

  register(EventType.ACTION_STARTED, async (payload) => {
    const roomId = eventRoomId(payload);
    if (roomId) {
      services.runController.noteRuntimeActionStarted(
        roomId,
        eventActionLabel(payload) ?? "action",
      );
    }
  });

  register(EventType.ACTION_COMPLETED, async (payload) => {
    const roomId = eventRoomId(payload);
    if (roomId) {
      services.runController.noteRuntimeActionCompleted(
        roomId,
        eventActionLabel(payload),
      );
    }
  });

  register(EventType.MESSAGE_RECEIVED, async (payload) => {
    const roomId = eventRoomId(payload);
    if (roomId) {
      services.runController.noteRuntimeMessage(roomId);
    }
  });

  register(EventType.MESSAGE_SENT, async (payload) => {
    const roomId = eventRoomId(payload);
    if (roomId) {
      services.runController.updateRuntimeWaiting(roomId);
    }
  });

  const agentEvents = getAgentEventService(runtime);
  if (agentEvents) {
    agentEvents.subscribe((event) => {
      if (!event.roomId) {
        return;
      }
      const roomId = String(event.roomId);
      const label = agentEventLabel(event.data);
      services.runController.noteRuntimeStream(roomId, event.stream, label);
    });

    agentEvents.subscribeHeartbeat((event) => {
      services.runController.noteHeartbeat(
        event.status,
        event.preview,
        event.indicatorType,
      );
    });

    services.runController.markAgentEventBridgeAttached(true);
  }

  services.awareness.initialize(services);
  services.runController.markRuntimeBridgeAttached(true);
}
