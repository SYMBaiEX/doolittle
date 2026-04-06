import type { CliState } from "@/cli/execution";
import { truncate } from "@/cli/text-utils";
import type { AppContext } from "@/runtime/bootstrap";
import { formatRunEvent, shouldRenderRunEvent } from "@/runtime/run-progress";

interface TuiRuntimeObserverOptions {
  context: AppContext;
  state: CliState;
  isBusy: () => boolean;
  appendActivity: (
    kind: string,
    message: string,
    tone: "info" | "success" | "warning" | "error" | "agent" | undefined,
  ) => void;
  pushNotice: (kind: "context" | "skills" | "status", message: string) => void;
  pushLiveToolEvent: (detail: string) => void;
  getLiveResponse: () =>
    | {
        pending?: boolean;
      }
    | undefined;
  refreshLiveResponse: () => void;
  scheduleRefreshPanels: (delayMs?: number) => void;
}

export function installTuiRuntimeObservers(
  options: TuiRuntimeObserverOptions,
): () => void {
  const {
    context,
    state,
    isBusy,
    appendActivity,
    pushNotice,
    pushLiveToolEvent,
    getLiveResponse,
    refreshLiveResponse,
    scheduleRefreshPanels,
  } = options;

  const unsubscribers = [
    context.gateway.onUpdate((event) => {
      appendActivity(
        event.platform === "gateway" ? "gw" : event.platform,
        truncate(event.detail, 160),
        event.kind === "reject" ? "warning" : "info",
      );
      scheduleRefreshPanels();
    }),
    context.services.terminal.onUpdate((event) => {
      appendActivity(
        "exec",
        `${event.detail} → ${event.exitCode}`,
        event.exitCode === 0 ? "success" : "warning",
      );
      if (isBusy()) {
        pushLiveToolEvent(
          `shell ${truncate(event.detail, 64)} → ${event.exitCode}`,
        );
      }
      scheduleRefreshPanels();
    }),
    context.services.delegation.onUpdate((event) => {
      appendActivity("task", truncate(event.detail, 160), "info");
      if (isBusy()) {
        pushLiveToolEvent(`delegate ${truncate(event.detail, 72)}`);
      }
      scheduleRefreshPanels();
    }),
    context.services.runController.onUpdate((event) => {
      if (event.sessionId !== state.activeSessionId) {
        scheduleRefreshPanels();
        return;
      }
      if (event.type === "approvals" && event.run.pendingApprovals > 0) {
        pushNotice(
          "status",
          `Pending execution approvals: ${event.run.pendingApprovals}`,
        );
      }
      if (!shouldRenderRunEvent(event.run.progressMode, event)) {
        scheduleRefreshPanels();
        return;
      }
      const detail = formatRunEvent(event);
      if (!detail) {
        scheduleRefreshPanels();
        return;
      }
      if (isBusy()) {
        if (
          event.type === "action-started" ||
          event.type === "action-completed" ||
          event.type === "approvals" ||
          event.type === "error" ||
          (event.type === "stream" && event.run.activeStream !== "assistant")
        ) {
          pushLiveToolEvent(detail);
        }
        if (getLiveResponse()?.pending) {
          refreshLiveResponse();
        }
        if (
          event.type === "completed" ||
          event.type === "error" ||
          event.type === "approvals"
        ) {
          appendActivity(
            "run",
            truncate(detail, 160),
            event.type === "error"
              ? "warning"
              : event.type === "completed"
                ? "success"
                : "info",
          );
        }
      } else {
        appendActivity(
          "run",
          truncate(detail, 160),
          event.type === "error"
            ? "warning"
            : event.type === "completed"
              ? "success"
              : "info",
        );
      }
      scheduleRefreshPanels(0);
    }),
    context.services.startupState.onUpdate(() => {
      scheduleRefreshPanels(0);
    }),
    context.services.sessions.onActivity((event) => {
      if (
        event.sessionId === state.activeSessionId &&
        (event.role === "user" || event.role === "assistant")
      ) {
        return;
      }
      appendActivity("mem", truncate(event.detail, 160), "agent");
      scheduleRefreshPanels();
    }),
    context.services.apiTransport.onUpdate((event) => {
      appendActivity(
        "api",
        `${event.record.id} ${truncate(event.record.outputText, 120)}`,
        "agent",
      );
      scheduleRefreshPanels();
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
}
