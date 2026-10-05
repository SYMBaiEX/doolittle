import type {
  BotConsultationResult,
  BotRunOwner,
} from "@doolittle/contracts/bots";
import type { Action, ActionResult, HandlerOptions } from "@elizaos/core";
import { readWorkerBotProfile } from "@/runtime/bootstrap/bot-profile";
import { requestWorkerHost } from "@/runtime/bootstrap/worker-host-rpc";
import { getScopedExecutionLease } from "@/runtime/execution-admission";
import { getScopedTurnAbortSignal } from "@/runtime/turn-runtime-scope";
import type { AppServices } from "@/services";

interface DispatchReceipt {
  dispatchId: string;
}

function parameters(
  options: HandlerOptions | undefined,
): { targetBotId: string; objective: string; knowledgeIds: string[] } | null {
  const value = options?.parameters;
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.targetBotId !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(input.targetBotId) ||
    typeof input.objective !== "string" ||
    !input.objective.trim() ||
    input.objective.length > 32_000
  )
    return null;
  if (
    input.knowledgeIds !== undefined &&
    (!Array.isArray(input.knowledgeIds) ||
      input.knowledgeIds.length > 8 ||
      input.knowledgeIds.some(
        (id: unknown) =>
          typeof id !== "string" || !/^[0-9a-f-]{36}$/iu.test(id),
      ))
  )
    return null;
  return {
    targetBotId: input.targetBotId,
    objective: input.objective.trim(),
    knowledgeIds: (input.knowledgeIds as string[] | undefined) ?? [],
  };
}

/** Explicit, one-shot consultation. The host owns lineage, grants and dispatch. */
export function createConsultBotAction(services: AppServices): Action {
  return {
    name: "DOOLITTLE_CONSULT_BOT",
    similes: ["ASK_ANOTHER_BOT"],
    description:
      "Ask an approved persistent bot to complete a bounded task, then wait for its exact run result. Use only when the user requested collaboration or a specialist bot is needed.",
    descriptionCompressed:
      "Consult an approved persistent bot and wait for its result.",
    contexts: ["workflow"],
    validate: async () => process.env.DOOLITTLE_DESKTOP_RUNTIME === "1",
    parameters: [
      {
        name: "targetBotId",
        description: "Exact approved bot ID.",
        required: true,
        schema: { type: "string", minLength: 1 },
      },
      {
        name: "objective",
        description: "Bounded task for the target bot.",
        required: true,
        schema: { type: "string", minLength: 1 },
      },
      {
        name: "knowledgeIds",
        description:
          "Optional exact IDs of explicitly promoted project knowledge already granted to the target bot.",
        required: false,
        schema: { type: "array", items: { type: "string" } },
      },
    ],
    handler: async (
      runtime,
      message,
      _state,
      options,
      callback,
    ): Promise<ActionResult> => {
      const input = parameters(options);
      const lease = getScopedExecutionLease();
      const signal = getScopedTurnAbortSignal(runtime);
      if (!input || !lease) {
        const text =
          "A scoped desktop run and target bot are required for consultation.";
        return { success: false, text, userFacingText: text };
      }
      const run = services.runController.getByRunId(lease.runId);
      if (
        !run ||
        !["thinking", "acting", "waiting"].includes(run.status) ||
        String(message.roomId) !== run.roomId
      ) {
        const text = "The originating run is no longer active.";
        return { success: false, text, userFacingText: text };
      }
      const worker = readWorkerBotProfile();
      const projectId = services.sessions.projectIdForSession(run.sessionId);
      const origin: BotRunOwner = {
        botId: worker?.id ?? String(runtime.agentId),
        agentId: String(runtime.agentId),
        sessionId: run.sessionId,
        runId: run.runId,
        ...(projectId ? { projectId } : {}),
      };
      const deadline = Date.now() + 5 * 60_000;
      let dispatchId: string | undefined;
      try {
        const result = await lease.yieldFor(
          async () => {
            const submitted = (await requestWorkerHost(
              "consult.dispatch",
              {
                origin,
                targetBotId: input.targetBotId,
                objective: input.objective,
                context: [],
                knowledgeIds: input.knowledgeIds,
                deadline: new Date(deadline).toISOString(),
              },
              { timeoutMs: 15_000, signal },
            )) as DispatchReceipt;
            if (typeof submitted?.dispatchId !== "string")
              throw new Error("Consultation dispatch receipt is invalid.");
            dispatchId = submitted.dispatchId;
            const awaited = (await requestWorkerHost(
              "consult.wait",
              { dispatchId },
              {
                timeoutMs: Math.max(1_000, deadline - Date.now() + 5_000),
                signal,
              },
            )) as BotConsultationResult;
            if (
              awaited?.dispatchId !== dispatchId ||
              !["complete", "cancelled", "error", "timeout"].includes(
                awaited.outcome,
              )
            ) {
              throw new Error("Consultation result is invalid.");
            }
            return awaited;
          },
          { deadline, signal },
        );
        const text =
          result.outcome === "complete"
            ? result.text
            : `The consulted bot ended ${result.outcome} without a completed result.`;
        await callback?.({ text, source: "doolittle-consult-bot" });
        return {
          success: result.outcome === "complete",
          text,
          userFacingText: text,
          data: {
            dispatchId: result.dispatchId,
            owner: result.owner,
            outcome: result.outcome,
            evidence: result.evidence,
          },
        };
      } catch (error) {
        if (dispatchId) {
          await requestWorkerHost(
            "consult.cancel",
            { dispatchId },
            { timeoutMs: 5_000 },
          ).catch(() => undefined);
        }
        const text =
          error instanceof Error ? error.message : "Consultation failed.";
        await callback?.({ text, source: "doolittle-consult-bot" });
        return { success: false, text, userFacingText: text };
      }
    },
  };
}
