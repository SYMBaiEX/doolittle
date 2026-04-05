import {
  cancelEffectiveDelegationTask,
  createEffectiveDelegationTask,
  retryEffectiveDelegationTask,
  spawnEffectiveDelegationChild,
  superviseEffectiveDelegationQueue,
} from "@/runtime/native/service-bridge/index";

import type { AgentExecutionContext } from "../chat";
import {
  parseDelegationFilter,
  parseDelegationLabels,
  parseDelegationMetadata,
  parseDelegationSegments,
  parseDelegationSpawnSegments,
  parseRetryPayload,
} from "./delegation-command-parsers";

interface DelegationMutationOptions {
  runDelegationTaskInWorker: (
    taskId: string,
    options?: { assumeRunning?: boolean },
  ) => Promise<unknown>;
}

async function runDelegationWorker(
  task: unknown,
  options: DelegationMutationOptions,
): Promise<string> {
  const completedTask = await options.runDelegationTaskInWorker(
    (task as { id: string }).id,
    {
      assumeRunning: true,
    },
  );
  return (
    (completedTask as { notes?: string[] }).notes?.at(-1) ??
    "Delegated worker completed."
  );
}

export async function handleDelegationMutationCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: DelegationMutationOptions,
): Promise<string | undefined> {
  if (
    trimmed === "/delegate supervise" ||
    trimmed.startsWith("/delegate supervise ")
  ) {
    const raw = trimmed.replace("/delegate supervise", "").trim();
    const parsed = parseDelegationFilter(raw);
    const report = await superviseEffectiveDelegationQueue(
      context.runtime,
      context.services,
      async (task) => runDelegationWorker(task, options),
      {
        concurrency:
          Number.isFinite(parsed.concurrency) &&
          (parsed.concurrency as number) > 0
            ? (parsed.concurrency as number)
            : 2,
        filter: {
          group: parsed.group,
          profile: parsed.profile,
          priority: parsed.priority,
          label: parsed.label,
          parentTaskId: parsed.parentTaskId,
          status: parsed.status,
          executionMode: parsed.executionMode,
        },
        onComplete: async (task: unknown) => {
          context.services.skillSynthesis.synthesizeFromTask(
            task as Parameters<
              typeof context.services.skillSynthesis.synthesizeFromTask
            >[0],
          );
        },
        onError: async (task: unknown, error: string) => {
          context.services.delegation.addNote(
            (task as { id: string }).id,
            `system: supervision error ${error}`,
          );
        },
      },
    );
    return JSON.stringify(report, null, 2);
  }

  if (trimmed.startsWith("/delegate create ")) {
    const payload = trimmed.replace("/delegate create ", "");
    const parsed = parseDelegationSegments(payload);
    if (!parsed) {
      return "Usage: /delegate create <title> | group:research | profile:research | priority:high | labels:browser,voice | metadata:owner=alice :: <objective>";
    }
    const task = createEffectiveDelegationTask(
      context.runtime,
      context.services,
      {
        title: parsed.head,
        objective: parsed.objective,
        group: parsed.options.group,
        profile: parsed.options.profile,
        priority:
          parsed.options.priority === "low" ||
          parsed.options.priority === "normal" ||
          parsed.options.priority === "high"
            ? parsed.options.priority
            : "normal",
        tags: parseDelegationLabels(
          parsed.options.labels ?? parsed.options.tags,
        ),
        labels: parseDelegationLabels(
          parsed.options.labels ?? parsed.options.tags,
        ),
        metadata: parseDelegationMetadata(
          parsed.options.metadata ?? parsed.options.meta,
        ),
        executionMode: "delegated",
      },
    );
    return JSON.stringify(task, null, 2);
  }

  if (trimmed.startsWith("/delegate spawn ")) {
    const payload = trimmed.replace("/delegate spawn ", "");
    const parsed = parseDelegationSpawnSegments(payload);
    if (!parsed) {
      return "Usage: /delegate spawn <parent-id> | title:Child Task | group:research | profile:research | priority:high | labels:browser :: <objective>";
    }
    const child = spawnEffectiveDelegationChild(
      context.runtime,
      context.services,
      parsed.parentId,
      {
        title: parsed.options.title ?? `${parsed.parentId} child`,
        objective: parsed.objective,
        group: parsed.options.group,
        profile: parsed.options.profile,
        priority:
          parsed.options.priority === "low" ||
          parsed.options.priority === "normal" ||
          parsed.options.priority === "high"
            ? parsed.options.priority
            : undefined,
        tags: parseDelegationLabels(
          parsed.options.labels ?? parsed.options.tags,
        ),
        labels: parseDelegationLabels(
          parsed.options.labels ?? parsed.options.tags,
        ),
        metadata: parseDelegationMetadata(
          parsed.options.metadata ?? parsed.options.meta,
        ),
        executionMode: "delegated",
      },
    );
    return JSON.stringify(child, null, 2);
  }

  if (trimmed.startsWith("/delegate note ")) {
    const payload = trimmed.replace("/delegate note ", "");
    const [id, note] = payload.split("::").map((part) => part.trim());
    if (!id || !note) {
      return "Usage: /delegate note <id> :: <note>";
    }
    return JSON.stringify(
      context.services.delegation.addNote(id, note),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/delegate run ")) {
    const id = trimmed.replace("/delegate run ", "").trim();
    return JSON.stringify(context.services.delegation.markRunning(id), null, 2);
  }

  if (trimmed.startsWith("/delegate execute ")) {
    const id = trimmed.replace("/delegate execute ", "").trim();
    return JSON.stringify(await options.runDelegationTaskInWorker(id), null, 2);
  }

  if (
    trimmed === "/delegate execute-queued" ||
    trimmed.startsWith("/delegate execute-queued ")
  ) {
    const raw = trimmed.replace("/delegate execute-queued", "").trim();
    const concurrency = raw ? Number(raw) : undefined;
    const report = await superviseEffectiveDelegationQueue(
      context.runtime,
      context.services,
      async (task) => runDelegationWorker(task, options),
      {
        concurrency:
          Number.isFinite(concurrency) && (concurrency as number) > 0
            ? (concurrency as number)
            : 2,
        onComplete: async (task: unknown) => {
          context.services.skillSynthesis.synthesizeFromTask(
            task as Parameters<
              typeof context.services.skillSynthesis.synthesizeFromTask
            >[0],
          );
        },
        onError: async (task: unknown, error: string) => {
          context.services.delegation.addNote(
            (task as { id: string }).id,
            `system: queue error ${error}`,
          );
        },
      },
    );
    return JSON.stringify(report, null, 2);
  }

  if (trimmed.startsWith("/delegate retry ")) {
    const payload = trimmed.replace("/delegate retry ", "");
    const parsed = parseRetryPayload(payload);
    if (!parsed.id) {
      return "Usage: /delegate retry <id> [| cascade:children] :: <optional note>";
    }
    return JSON.stringify(
      retryEffectiveDelegationTask(
        context.runtime,
        context.services,
        parsed.id,
        parsed.note || "Requeued for retry.",
        parsed.cascadeChildren ? { cascadeChildren: true } : undefined,
      ),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/retry ")) {
    const parsed = parseRetryPayload(trimmed.replace("/retry ", "").trim());
    if (!parsed.id) {
      return "Usage: /delegate retry <id> [| cascade:children] :: <optional note>";
    }
    return JSON.stringify(
      retryEffectiveDelegationTask(
        context.runtime,
        context.services,
        parsed.id,
        parsed.note || "Requeued for retry.",
        parsed.cascadeChildren ? { cascadeChildren: true } : undefined,
      ),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/delegate cancel ")) {
    const payload = trimmed.replace("/delegate cancel ", "");
    const [id, note] = payload.split("::").map((part) => part.trim());
    if (!id) {
      return "Usage: /delegate cancel <id> :: <optional note>";
    }
    return JSON.stringify(
      cancelEffectiveDelegationTask(
        context.runtime,
        context.services,
        id,
        note || "Cancelled by operator.",
      ),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/delegate complete ")) {
    const payload = trimmed.replace("/delegate complete ", "");
    const [id, note] = payload.split("::").map((part) => part.trim());
    if (!id) {
      return "Usage: /delegate complete <id> :: <optional note>";
    }
    return JSON.stringify(
      context.services.delegation.complete(id, note),
      null,
      2,
    );
  }

  return undefined;
}
