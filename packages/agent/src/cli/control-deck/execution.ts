import { escapeBlessed } from "@/cli/render-utils";
import { truncate } from "@/cli/text-utils";
import type { AppContext } from "@/runtime/bootstrap";
import { formatElapsedMs, getRunElapsedMs } from "@/runtime/run-progress";

export function renderExecutionContent(context: AppContext): string {
  const activeRuns = context.services.runController.listActive().slice(0, 6);

  return [
    "{bold}Execution Deck{/}",
    `Active runs: ${activeRuns.length}`,
    "",
    ...(activeRuns.length
      ? activeRuns.map((run) => {
          const elapsed = formatElapsedMs(getRunElapsedMs(run));
          const action = run.activeAction
            ? ` action=${truncate(run.activeAction, 28)}`
            : "";
          const detail = run.statusDetail
            ? ` detail=${truncate(run.statusDetail, 28)}`
            : "";
          const approvals =
            run.pendingApprovals > 0
              ? ` approvals=${run.pendingApprovals}`
              : "";
          return [
            `- ${escapeBlessed(run.sessionId)} {cyan-fg}[${run.status}]{/}`,
            `  room=${truncate(run.roomId, 24)} steps=${run.observedActionCount}${approvals}${elapsed ? ` elapsed=${escapeBlessed(elapsed)}` : ""}`,
            `  stream=${run.activeStream ?? "n/a"}${action}${detail}`,
          ].join("\n");
        })
      : ["{gray-fg}No active runs are being tracked yet.{/}"]),
    "",
    "{gray-fg}This panel reflects live execution turns, approvals, and tool motion.{/}",
  ].join("\n");
}
