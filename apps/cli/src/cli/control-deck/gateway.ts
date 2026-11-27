import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import {
  clipControlDeckLine,
  clipControlDeckText,
  escapeControlDeckBlessed,
  normalizeControlDeckWidth,
  renderControlDeckHeading,
} from "./width";

function fitPlainLine(text: string, width: number): string {
  return clipControlDeckLine(text, width);
}

function renderWatchdogLine(running: boolean, width: number): string {
  const state = running ? "running" : "stopped";
  const plain = `Watchdog: ${state}`;
  if (plain.length > width) {
    return clipControlDeckText(plain, width);
  }
  return `Watchdog: ${running ? "{green-fg}running{/}" : "{red-fg}stopped{/}"}`;
}

function renderRestartLine(
  state: {
    restartRuns: number;
    restartRecoveries: number;
    restartBackoffs: number;
  },
  width: number,
): string {
  const full = `Restarts: ${state.restartRuns} recoveries=${state.restartRecoveries} backoffs=${state.restartBackoffs}`;
  if (full.length <= width) {
    return full;
  }
  const compact = `Restarts ${state.restartRuns}/${state.restartRecoveries}/${state.restartBackoffs}`;
  return fitPlainLine(compact, width);
}

function renderLastWatchdogLine(
  value: string | undefined,
  width: number,
): string {
  if (!value) {
    return "Last watchdog: n/a";
  }
  const full = `Last watchdog: ${value}`;
  if (full.length <= width) {
    return full;
  }
  const time = value.slice(11, 19) || value;
  return fitPlainLine(`Watchdog ${time}`, width);
}

function renderMutedLine(text: string, width: number): string {
  return `{gray-fg}${escapeControlDeckBlessed(clipControlDeckText(text, width))}{/}`;
}

function renderLatestInbox(
  record:
    | {
        recordId: string;
        platform: string;
        textPreview: string;
      }
    | undefined,
  width: number,
): string {
  if (!record) {
    return renderMutedLine("No inbox records available.", width);
  }
  const recordId = clipControlDeckText(
    record.recordId,
    width - "Latest inbox: ".length,
  );
  const previewPrefix = `- ${record.platform} `;
  const preview = clipControlDeckText(
    record.textPreview,
    width - previewPrefix.length,
  );
  return `Latest inbox: ${escapeControlDeckBlessed(recordId)}\n${previewPrefix}${escapeControlDeckBlessed(preview)}`;
}

export async function renderGatewayOpsContent(
  context: AppContext,
  width = 80,
): Promise<string> {
  const contentWidth = normalizeControlDeckWidth(width);
  const history = await context.gateway.history(6);
  const supervision = context.gateway.supervision(4);
  const latestInbox = history.inbox.at(0);
  const daemon = context.gateway.runtimeStatus().daemon;

  return [
    renderControlDeckHeading("Gateway Journal", "Gateway", contentWidth),
    fitPlainLine(`Traces: ${history.traces.length}`, contentWidth),
    fitPlainLine(`Inbox: ${history.inbox.length}`, contentWidth),
    fitPlainLine(`Deliveries: ${history.deliveries.length}`, contentWidth),
    fitPlainLine(`Attachments: ${history.attachments.length}`, contentWidth),
    "",
    renderControlDeckHeading("Daemon", "Daemon", contentWidth),
    renderWatchdogLine(daemon.watchdog.running, contentWidth),
    renderRestartLine(daemon.state, contentWidth),
    fitPlainLine(`Queue: ${daemon.restartQueue.length} pending`, contentWidth),
    renderLastWatchdogLine(daemon.state.lastWatchdogAt, contentWidth),
    "",
    renderControlDeckHeading("Supervision", "Supervision", contentWidth),
    ...(supervision.length
      ? supervision.map((record) => {
          const prefix = `- ${record.at.slice(11, 19)} `;
          const detail = clipControlDeckText(
            record.detail,
            contentWidth - prefix.length,
          );
          return `${prefix}${escapeControlDeckBlessed(detail)}`;
        })
      : [renderMutedLine("No supervision records yet.", contentWidth)]),
    "",
    renderControlDeckHeading("Replay Target", "Replay", contentWidth),
    renderLatestInbox(latestInbox, contentWidth),
  ].join("\n");
}
