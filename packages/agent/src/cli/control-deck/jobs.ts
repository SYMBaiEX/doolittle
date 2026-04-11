import { listCliJobs } from "@/cli/jobs";
import { truncate } from "@/cli/text-utils";
import type { AppContext } from "@/runtime/bootstrap";
import { canonicalizeSlashCommandSyntax } from "@/runtime/command-catalog";

export function renderJobsContent(context: AppContext): string {
  const jobs = listCliJobs(context.config.dataDir).slice(0, 8);
  return [
    "{bold}Background Jobs{/}",
    `Tracked: ${jobs.length}`,
    "",
    ...(jobs.length
      ? jobs.map((job) => {
          const statusColor =
            job.status === "completed"
              ? "green-fg"
              : job.status === "running"
                ? "yellow-fg"
                : job.status === "failed"
                  ? "red-fg"
                  : job.status === "cancelled"
                    ? "magenta-fg"
                    : "cyan-fg";
          return [
            `- ${job.id.slice(0, 8)} {${statusColor}}[${job.status}]{/}`,
            `  prompt=${truncate(job.prompt, 34)}`,
            job.completedAt
              ? `  done=${job.completedAt.slice(11, 19)} exit=${job.exitCode ?? "n/a"}`
              : job.startedAt
                ? `  started=${job.startedAt.slice(11, 19)} pid=${job.pid ?? "n/a"}`
                : `  queued=${job.createdAt.slice(11, 19)}`,
          ].join("\n");
        })
      : ["{gray-fg}No detached jobs yet.{/}"]),
    "",
    "{bold}Shell Surface{/}",
    `- ${canonicalizeSlashCommandSyntax("/jobs")}`,
    `- ${canonicalizeSlashCommandSyntax("/jobs show <id>")}`,
    `- ${canonicalizeSlashCommandSyntax("/jobs attach <id>")}`,
    `- ${canonicalizeSlashCommandSyntax("/jobs cancel <id>")}`,
  ].join("\n");
}
