import type { AgentExecutionContext } from "../../chat";
import { parseTrajectoryArgs } from "./shared";

export async function handleTrajectoryIngestCommands(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/trajectories ingest gateway") {
    if (!context.gateway) {
      return "Gateway runtime is not available in this execution context.";
    }
    const history = await context.gateway.history(200);
    return JSON.stringify(
      context.services.trajectories.ingestGatewayHistory({
        traces: history.traces,
        inbox: history.inbox,
        outbox: history.outbox,
        label: "gateway-history",
        purpose: "gateway history ingest",
        tags: ["gateway", "history"],
      }),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/trajectories ingest gateway ")) {
    if (!context.gateway) {
      return "Gateway runtime is not available in this execution context.";
    }
    const options = parseTrajectoryArgs(
      trimmed.replace("/trajectories ingest gateway ", ""),
    );
    const history = await context.gateway.history(options.limit ?? 200);
    return JSON.stringify(
      context.services.trajectories.ingestGatewayHistory({
        traces: history.traces,
        inbox: history.inbox,
        outbox: history.outbox,
        label: options.label ?? "gateway-history",
        purpose: options.purpose ?? "gateway history ingest",
        tags: options.tags ?? ["gateway", "history"],
        notes: options.notes,
      }),
      null,
      2,
    );
  }

  return undefined;
}
