import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";

export async function handleCronReadCommand(
  _input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/cron" || trimmed === "/cron list") {
    const jobs =
      (getNativeServices(context.runtime).cron?.list() as Array<{
        id: string;
        name: string;
        status: string;
        schedule: string;
        nextRunAt?: string;
        skills?: string[];
        runtime?: { model?: string; personalityId?: string };
      }>) ?? context.services.cron.list();
    return jobs.length
      ? jobs
          .map(
            (job) =>
              `- ${job.id} ${job.name} [${job.status}] schedule="${job.schedule}" next=${job.nextRunAt ?? "n/a"} skills=${(job.skills ?? []).join(",") || "none"} model=${job.runtime?.model ?? "default"} personality=${job.runtime?.personalityId ?? "active"}`,
          )
          .join("\n")
      : "No cron jobs configured.";
  }

  if (trimmed === "/cron runs") {
    const runs =
      (getNativeServices(context.runtime).cron?.runs(10) as Array<{
        jobName: string;
        createdAt: string;
        outputPath?: string;
        output: string;
      }>) ?? context.services.cron.recentRuns(10);
    return runs.length
      ? runs
          .map(
            (run) =>
              `- ${run.jobName} [${run.createdAt}]${run.outputPath ? ` output=${run.outputPath}` : ""}\n${run.output.slice(0, 240)}`,
          )
          .join("\n\n")
      : "No cron runs recorded.";
  }

  if (trimmed.startsWith("/cron show ")) {
    const job = context.services.cron.get(
      trimmed.replace("/cron show ", "").trim(),
    );
    if (!job) {
      return "Cron job not found.";
    }
    return JSON.stringify(job, null, 2);
  }

  return undefined;
}
