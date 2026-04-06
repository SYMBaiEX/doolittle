import { truncate } from "@/cli/text-utils";
import type { AppContext } from "@/runtime/bootstrap";

export async function renderGatewayOpsContent(
  context: AppContext,
): Promise<string> {
  const history = await context.gateway.history(6);
  const supervision = context.gateway.supervision(4);
  const latestInbox = history.inbox.at(0);
  const daemon = context.gateway.runtimeStatus().daemon;

  return [
    "{bold}Gateway Journal{/}",
    `Traces: ${history.traces.length}`,
    `Inbox: ${history.inbox.length}`,
    `Deliveries: ${history.deliveries.length}`,
    `Attachments: ${history.attachments.length}`,
    "",
    "{bold}Daemon{/}",
    `Watchdog: ${daemon.watchdog.running ? "{green-fg}running{/}" : "{red-fg}stopped{/}"}`,
    `Restarts: ${daemon.state.restartRuns} recoveries=${daemon.state.restartRecoveries} backoffs=${daemon.state.restartBackoffs}`,
    `Queue: ${daemon.restartQueue.length} pending`,
    daemon.state.lastWatchdogAt
      ? `Last watchdog: ${daemon.state.lastWatchdogAt}`
      : "Last watchdog: n/a",
    "",
    "{bold}Supervision{/}",
    ...(supervision.length
      ? supervision.map(
          (record) =>
            `- ${record.at.slice(11, 19)} ${truncate(record.detail, 30)}`,
        )
      : ["{gray-fg}No supervision records yet.{/}"]),
    "",
    "{bold}Replay Target{/}",
    latestInbox
      ? `Latest inbox: ${latestInbox.recordId}\n- ${latestInbox.platform} ${truncate(latestInbox.textPreview, 30)}`
      : "{gray-fg}No inbox records available.{/}",
  ].join("\n");
}
