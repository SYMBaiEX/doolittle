import type { AgentExecutionContext } from "../../chat";
import { handleTrajectoryAnalyzeCommands } from "./analyze";
import { handleTrajectoryBatchCommands } from "./batch";
import { handleTrajectoryBenchmarkCommands } from "./benchmark";
import { handleTrajectoryCompareCommands } from "./compare";
import { handleTrajectoryCompressionCommands } from "./compression";
import { handleTrajectoryExportCommands } from "./export";
import { handleTrajectoryIngestCommands } from "./ingest";

export type TrajectoryCommandHandler = (
  trimmed: string,
  context: AgentExecutionContext,
) => Promise<string | undefined>;

export async function runTrajectoryCommandHandlers(
  trimmed: string,
  context: AgentExecutionContext,
  handlers: TrajectoryCommandHandler[],
): Promise<string | undefined> {
  for (const handler of handlers) {
    const result = await handler(trimmed, context);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}

export async function handleTrajectoryCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  return runTrajectoryCommandHandlers(trimmed, context, [
    handleTrajectoryExportCommands,
    handleTrajectoryAnalyzeCommands,
    handleTrajectoryBenchmarkCommands,
    handleTrajectoryCompareCommands,
    handleTrajectoryIngestCommands,
    handleTrajectoryBatchCommands,
    handleTrajectoryCompressionCommands,
  ]);
}

export { handleTrajectoryAnalyzeCommands } from "./analyze";
export { handleTrajectoryBatchCommands } from "./batch";
export { handleTrajectoryBenchmarkCommands } from "./benchmark";
export { handleTrajectoryCompareCommands } from "./compare";
export { handleTrajectoryCompressionCommands } from "./compression";
export { handleTrajectoryExportCommands } from "./export";
export { handleTrajectoryIngestCommands } from "./ingest";
