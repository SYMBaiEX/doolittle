import {
  addEffectiveDelegationNote,
  cancelEffectiveDelegationTask,
  completeEffectiveDelegationTask,
  retryEffectiveDelegationTask,
} from "@/runtime/native/service-bridge/delegation";
import type { AgentExecutionContext } from "../../chat";
import { parseRetryPayload } from "../delegation-command-parsers";
import type { DelegationMutationOptions } from "./types";

export async function handleDelegationTaskMutation(
  trimmed: string,
  context: AgentExecutionContext,
  options: DelegationMutationOptions,
): Promise<string | undefined> {
  if (trimmed.startsWith("/delegate note ")) {
    const payload = trimmed.replace("/delegate note ", "");
    const [id, note] = payload.split("::").map((part) => part.trim());
    if (!id || !note) {
      return "Usage: /delegate note <id> :: <note>";
    }
    return JSON.stringify(
      await addEffectiveDelegationNote(
        context.runtime,
        context.services.delegationProjection,
        id,
        note,
      ),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/delegate run ")) {
    return "Task lifecycle is owned by the official orchestrator. Use /delegate execute <id> to spawn an ACP task agent.";
  }

  if (trimmed.startsWith("/delegate execute ")) {
    const id = trimmed.replace("/delegate execute ", "").trim();
    return JSON.stringify(await options.runDelegationTaskInWorker(id), null, 2);
  }

  if (trimmed.startsWith("/delegate retry ")) {
    const payload = trimmed.replace("/delegate retry ", "");
    const parsed = parseRetryPayload(payload);
    if (!parsed.id) {
      return "Usage: /delegate retry <id> [| cascade:children] :: <optional note>";
    }
    return JSON.stringify(
      await retryEffectiveDelegationTask(
        context.runtime,
        context.services.delegationProjection,
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
      await retryEffectiveDelegationTask(
        context.runtime,
        context.services.delegationProjection,
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
      await cancelEffectiveDelegationTask(
        context.runtime,
        context.services.delegationProjection,
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
      await completeEffectiveDelegationTask(
        context.runtime,
        context.services.delegationProjection,
        id,
        note,
      ),
      null,
      2,
    );
  }

  return undefined;
}
