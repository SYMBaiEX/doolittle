import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";

const TRIGGER_RUNTIME_UNAVAILABLE =
  "Trigger runtime service is not ready. Start the Eliza runtime and try again.";

export async function handleCronReadCommand(
  _input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  const nativeCron = getNativeServices(context.runtime).cron;
  if (trimmed === "/cron" || trimmed === "/cron list") {
    if (!nativeCron) return TRIGGER_RUNTIME_UNAVAILABLE;
    const jobs = await nativeCron.list();
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
    if (!nativeCron) return TRIGGER_RUNTIME_UNAVAILABLE;
    const runs = await nativeCron.runs(10);
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
    if (!nativeCron) return TRIGGER_RUNTIME_UNAVAILABLE;
    const id = trimmed.replace("/cron show ", "").trim();
    const job = await nativeCron.get(id);
    if (!job) {
      return "Cron job not found.";
    }
    return JSON.stringify(job, null, 2);
  }

  return undefined;
}
