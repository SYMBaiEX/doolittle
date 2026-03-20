import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import type { AppServices } from "@/services";

export function createCronAction(services: AppServices): Action {
  return {
    name: "ELIZA_AGENT_CRON",
    similes: ["CRONJOB", "SCHEDULE_TASK", "AUTOMATION"],
    description:
      "Manages scheduled jobs. Supports `/cron list`, `/cron create <schedule> :: <prompt>`, `/cron pause <id>`, `/cron resume <id>`, `/cron run <id>`, and `/cron remove <id>`.",
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text = typeof message.content === "string" ? message.content : message.content?.text;
      return Boolean(text && text.trim().startsWith("/cron"));
    },
    handler: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      _options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const text = typeof message.content === "string" ? message.content : message.content?.text;
      const trimmed = text?.trim() ?? "";
      let response = "";

      if (trimmed === "/cron" || trimmed === "/cron list") {
        const jobs = services.cron.list();
        response = jobs.length
          ? jobs
              .map(
                (job) =>
                  `- ${job.id} ${job.name} [${job.status}] schedule="${job.schedule}" next=${job.nextRunAt ?? "n/a"}`,
              )
              .join("\n")
          : "No cron jobs configured.";
      } else if (trimmed.startsWith("/cron create ")) {
        const payload = trimmed.replace("/cron create ", "");
        const [schedule, prompt] = payload.split("::").map((part) => part.trim());
        if (!schedule || !prompt) {
          response = "Usage: /cron create <schedule> :: <prompt>";
        } else {
          const created = services.cron.create({
            name: `job-${Date.now()}`,
            schedule,
            prompt,
          });
          response = `Created cron job ${created.id} with next run ${created.nextRunAt ?? "n/a"}.`;
        }
      } else if (trimmed.startsWith("/cron pause ")) {
        const job = services.cron.pause(trimmed.replace("/cron pause ", "").trim());
        response = `Paused ${job.id}.`;
      } else if (trimmed.startsWith("/cron resume ")) {
        const job = services.cron.resume(trimmed.replace("/cron resume ", "").trim());
        response = `Resumed ${job.id}; next run ${job.nextRunAt ?? "n/a"}.`;
      } else if (trimmed.startsWith("/cron run ")) {
        const job = services.cron.runNow(trimmed.replace("/cron run ", "").trim());
        response = `Marked ${job.id} to run immediately.`;
      } else if (trimmed.startsWith("/cron remove ")) {
        const id = trimmed.replace("/cron remove ", "").trim();
        services.cron.remove(id);
        response = `Removed ${id}.`;
      } else {
        response = "Usage: /cron list | create | pause | resume | run | remove";
      }

      await callback?.({ text: response, source: "cron-action" });
      return { success: true, text: response };
    },
    examples: [
      [
        {
          name: "{{userName}}",
          content: {
            text: "/cron create every 2h :: summarize recent deployment logs",
          },
        },
        {
          name: "{{agentName}}",
          content: {
            text: "Created cron job ...",
            actions: ["ELIZA_AGENT_CRON"],
          },
        },
      ],
    ],
  };
}
