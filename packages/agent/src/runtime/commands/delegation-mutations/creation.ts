import {
  createEffectiveDelegationTask,
  spawnEffectiveDelegationChild,
} from "@/runtime/native/service-bridge/delegation";
import type { AgentExecutionContext } from "../../chat";
import {
  parseDelegationLabels,
  parseDelegationMetadata,
  parseDelegationSegments,
  parseDelegationSpawnSegments,
} from "../delegation-command-parsers";
import { resolveDelegationPriority } from "./shared";

export async function handleDelegationCreationMutation(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed.startsWith("/delegate create ")) {
    const payload = trimmed.replace("/delegate create ", "");
    const parsed = parseDelegationSegments(payload);
    if (!parsed) {
      return "Usage: /delegate create <title> | group:research | profile:research | priority:high | labels:browser,voice | metadata:owner=alice :: <objective>";
    }
    const labels = parseDelegationLabels(
      parsed.options.labels ?? parsed.options.tags,
    );
    const task = createEffectiveDelegationTask(
      context.runtime,
      context.services,
      {
        title: parsed.head,
        objective: parsed.objective,
        group: parsed.options.group,
        profile: parsed.options.profile,
        priority:
          resolveDelegationPriority(parsed.options.priority) ?? "normal",
        tags: labels,
        labels,
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
    const labels = parseDelegationLabels(
      parsed.options.labels ?? parsed.options.tags,
    );
    const child = spawnEffectiveDelegationChild(
      context.runtime,
      context.services,
      parsed.parentId,
      {
        title: parsed.options.title ?? `${parsed.parentId} child`,
        objective: parsed.objective,
        group: parsed.options.group,
        profile: parsed.options.profile,
        priority: resolveDelegationPriority(parsed.options.priority),
        tags: labels,
        labels,
        metadata: parseDelegationMetadata(
          parsed.options.metadata ?? parsed.options.meta,
        ),
        executionMode: "delegated",
      },
    );
    return JSON.stringify(child, null, 2);
  }

  return undefined;
}
