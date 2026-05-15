import { getAgentEventService } from "@elizaos/autonomous/runtime/agent-event-service";
import { type ActionResult, type AgentRuntime, EventType } from "@elizaos/core";
import {
  extractCommandResultFromActionResult,
  extractFileOperationFromActionResult,
  extractLocalMutationFromActionResult,
} from "@/runtime/action-result-metadata";
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
    const actionName = contentActionResultName(content);
    if (actionName) {
      return actionName;
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

export function eventActionResult(
  payload: RuntimePayload,
): ActionResult | undefined {
  if (
    payload &&
    typeof payload === "object" &&
    "content" in payload &&
    payload.content &&
    typeof payload.content === "object"
  ) {
    const content = payload.content as {
      actionResult?: unknown;
      result?: unknown;
    };
    const actionResult = content.actionResult ?? content.result;
    if (actionResult && typeof actionResult === "object") {
      return actionResult as ActionResult;
    }
  }
  return undefined;
}

function contentActionResultName(content: object): string | undefined {
  const actionResult =
    (content as { actionResult?: unknown; result?: unknown }).actionResult ??
    (content as { result?: unknown }).result;
  if (!actionResult || typeof actionResult !== "object") {
    return undefined;
  }
  const data = (actionResult as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const actionName = (data as { actionName?: unknown }).actionName;
  return typeof actionName === "string" && actionName.trim()
    ? actionName.trim()
    : undefined;
}

function eventActionStatus(payload: RuntimePayload): string | undefined {
  if (
    payload &&
    typeof payload === "object" &&
    "content" in payload &&
    payload.content &&
    typeof payload.content === "object"
  ) {
    const status = (payload.content as { actionStatus?: unknown }).actionStatus;
    return typeof status === "string" ? status : undefined;
  }
  return undefined;
}

function recordActionTrajectory(input: {
  services: AppServices;
  roomId: string;
  event: "action.started" | "action.completed";
  action?: string;
  actionResult?: ActionResult;
  status?: string;
}): void {
  const run = input.services.runController.getByRoomId(input.roomId);
  const settings = input.services.settings.get().model;
  const mutation = extractLocalMutationFromActionResult(input.actionResult);
  const fileOperation = extractFileOperationFromActionResult(
    input.actionResult,
  );
  const commandResult = extractCommandResultFromActionResult(
    input.actionResult,
  );
  try {
    input.services.trajectories?.recordEvent({
      category: "action",
      event: input.event,
      sessionId: run?.sessionId,
      runId: run?.runId,
      roomId: input.roomId,
      source: run?.source,
      provider: settings.provider,
      model: settings.model,
      text: `[${input.event}] ${input.action ?? "action"}`,
      metadata: {
        action: input.action,
        status: input.status,
        success: input.actionResult?.success,
        actionResult: input.actionResult,
        mutation,
        fileOperation,
        commandResult,
      },
    });
  } catch {
    // Action progress must not be blocked by optional trajectory recording.
  }
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
      const action = eventActionLabel(payload) ?? "action";
      services.runController.noteRuntimeActionStarted(roomId, action);
      recordActionTrajectory({
        services,
        roomId,
        event: "action.started",
        action,
      });
    }
  });

  register(EventType.ACTION_COMPLETED, async (payload) => {
    const roomId = eventRoomId(payload);
    if (roomId) {
      const actionResult = eventActionResult(payload);
      const action = eventActionLabel(payload);
      services.runController.noteRuntimeActionCompleted(roomId, action);
      const mutation = extractLocalMutationFromActionResult(actionResult);
      if (mutation) {
        services.runController.recordRuntimeLocalMutation(roomId, mutation);
      }
      recordActionTrajectory({
        services,
        roomId,
        event: "action.completed",
        action,
        actionResult,
        status: eventActionStatus(payload),
      });
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
