import type { HeadlessTraceSummary } from "./trace-summary";

type ActionCountSummary = Pick<
  HeadlessTraceSummary,
  | "actionCompletions"
  | "actionFailures"
  | "actionStarts"
  | "actionSuccesses"
  | "journalAvailable"
>;

export function formatActionCounts(summary: ActionCountSummary): string {
  if (!summary.journalAvailable) {
    return "  Agent actions: telemetry unavailable.";
  }

  return `  Agent actions started ${summary.actionStarts} · completed ${summary.actionCompletions} · succeeded ${summary.actionSuccesses} · failed ${summary.actionFailures}.`;
}
