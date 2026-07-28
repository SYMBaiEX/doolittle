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

export async function handleCronMutationCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  const nativeCron = getNativeServices(context.runtime).cron;
  if (trimmed.startsWith("/cron create ")) {
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
    const created =
      ((await nativeCron?.create(createInput)) as
        | ReturnType<typeof context.services.cron.create>
        | undefined) ?? context.services.cron.create(createInput);
    return `Created cron job ${created.id} with next run ${created.nextRunAt ?? "n/a"}.`;
  }

  if (trimmed.startsWith("/cron update ")) {
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
    const updated =
      ((await nativeCron?.update(id, patch)) as
        | ReturnType<typeof context.services.cron.updateConfig>
        | undefined) ?? context.services.cron.updateConfig(id, patch);
    return `Updated cron job ${updated.id}; next run ${updated.nextRunAt ?? "n/a"}.`;
  }

  if (trimmed.startsWith("/cron pause ")) {
    const id = trimmed.replace("/cron pause ", "").trim();
    const job =
      ((await nativeCron?.pause?.(id)) as
        | ReturnType<typeof context.services.cron.pause>
        | undefined) ?? context.services.cron.pause(id);
    return `Paused ${job.id}.`;
  }

  if (trimmed.startsWith("/cron resume ")) {
    const id = trimmed.replace("/cron resume ", "").trim();
    const job =
      ((await nativeCron?.resume?.(id)) as
        | ReturnType<typeof context.services.cron.resume>
        | undefined) ?? context.services.cron.resume(id);
    return `Resumed ${job.id}; next run ${job.nextRunAt ?? "n/a"}.`;
  }

  if (trimmed.startsWith("/cron run ")) {
    const id = trimmed.replace("/cron run ", "").trim();
    const job =
      ((await nativeCron?.runNow?.(id)) as
        | ReturnType<typeof context.services.cron.runNow>
        | undefined) ?? context.services.cron.runNow(id);
    return `Marked ${job.id} to run immediately.`;
  }

  if (trimmed.startsWith("/cron remove ")) {
    const id = trimmed.replace("/cron remove ", "").trim();
    if (nativeCron?.remove) {
      await nativeCron.remove(id);
    } else {
      context.services.cron.remove(id);
    }
    return `Removed ${id}.`;
  }

  return undefined;
}
