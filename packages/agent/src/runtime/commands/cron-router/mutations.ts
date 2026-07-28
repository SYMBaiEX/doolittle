import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";
import {
  parseCronDelivery,
  parseCronRuntimeOptions,
  parseCronSegments,
  parseCronSkills,
} from "./parse";
import { CRON_CREATE_USAGE, CRON_UPDATE_USAGE } from "./usage";

const TRIGGER_RUNTIME_UNAVAILABLE =
  "Trigger runtime service is not ready. Start the Eliza runtime and try again.";

export async function handleCronMutationCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  const nativeCron = getNativeServices(context.runtime).cron;
  if (trimmed.startsWith("/cron create ")) {
    if (!nativeCron) return TRIGGER_RUNTIME_UNAVAILABLE;
    const payload = trimmed.replace("/cron create ", "");
    const parsed = parseCronSegments(payload);
    if (!parsed) {
      return CRON_CREATE_USAGE;
    }

    const createInput = {
      name: parsed.options.name ?? `job-${Date.now()}`,
      schedule: parsed.schedule,
      prompt: parsed.prompt,
      skills: parseCronSkills(parsed.options.skills),
      runtime: parseCronRuntimeOptions(parsed.options),
      delivery:
        parseCronDelivery(parsed.options.delivery) ??
        (input.source === "cron" ? "local" : "origin"),
    };
    const created = await nativeCron.create(createInput);
    return `Created cron job ${created.id} with next run ${created.nextRunAt ?? "n/a"}.`;
  }

  if (trimmed.startsWith("/cron update ")) {
    if (!nativeCron) return TRIGGER_RUNTIME_UNAVAILABLE;
    const payload = trimmed.replace("/cron update ", "").trim();
    const firstSpace = payload.indexOf(" ");
    if (firstSpace === -1) {
      return CRON_UPDATE_USAGE;
    }
    const id = payload.slice(0, firstSpace).trim();
    const rest = payload.slice(firstSpace + 1).trim();
    const parsed = parseCronSegments(rest);
    if (!id || !parsed) {
      return CRON_UPDATE_USAGE;
    }
    const patch = {
      name: parsed.options.name,
      schedule: parsed.schedule,
      prompt: parsed.prompt,
      skills: parseCronSkills(parsed.options.skills),
      runtime: parseCronRuntimeOptions(parsed.options),
      clearRuntime: parsed.options.runtime === "default",
      delivery: parseCronDelivery(parsed.options.delivery),
    };
    const updated = await nativeCron.update(id, patch);
    return `Updated cron job ${updated.id}; next run ${updated.nextRunAt ?? "n/a"}.`;
  }

  if (trimmed.startsWith("/cron pause ")) {
    if (!nativeCron) return TRIGGER_RUNTIME_UNAVAILABLE;
    if (!nativeCron.pause) return "Trigger runtime cannot pause jobs.";
    const id = trimmed.replace("/cron pause ", "").trim();
    const job = await nativeCron.pause(id);
    return `Paused ${job.id}.`;
  }

  if (trimmed.startsWith("/cron resume ")) {
    if (!nativeCron) return TRIGGER_RUNTIME_UNAVAILABLE;
    if (!nativeCron.resume) return "Trigger runtime cannot resume jobs.";
    const id = trimmed.replace("/cron resume ", "").trim();
    const job = await nativeCron.resume(id);
    return `Resumed ${job.id}; next run ${job.nextRunAt ?? "n/a"}.`;
  }

  if (trimmed.startsWith("/cron run ")) {
    if (!nativeCron) return TRIGGER_RUNTIME_UNAVAILABLE;
    if (!nativeCron.runNow) return "Trigger runtime cannot run jobs manually.";
    const id = trimmed.replace("/cron run ", "").trim();
    const job = await nativeCron.runNow(id);
    return `Marked ${job.id} to run immediately.`;
  }

  if (trimmed.startsWith("/cron remove ")) {
    if (!nativeCron) return TRIGGER_RUNTIME_UNAVAILABLE;
    if (!nativeCron.remove) return "Trigger runtime cannot remove jobs.";
    const id = trimmed.replace("/cron remove ", "").trim();
    await nativeCron.remove(id);
    return `Removed ${id}.`;
  }

  return undefined;
}
