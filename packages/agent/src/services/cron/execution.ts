import { randomUUID } from "node:crypto";
import type {
  AutomationRunRecord,
  AutomationRunStatus,
  AutomationTracePhase,
  AutomationTraceStep,
  CronJobRecord,
} from "@/types";
import {
  automationTriggerMatches,
  evaluateAutomationCondition,
  hydrateAutomationJob,
} from "./definition";
import type { AutomationExecutionContext, CronExecutor } from "./service/types";
import type { CronStorage } from "./storage";

export async function executeAutomationJob(params: {
  storage: CronStorage;
  executor: CronExecutor;
  job: CronJobRecord;
  context: AutomationExecutionContext;
}): Promise<AutomationRunRecord> {
  const { storage, executor, context } = params;
  const job = hydrateAutomationJob(params.job);
  const startedAt = new Date();
  const trace: AutomationTraceStep[] = [];

  if (!automationTriggerMatches(job, context.source)) {
    throw new Error(
      `Automation "${job.name}" cannot be invoked by a ${context.source} trigger.`,
    );
  }

  trace.push(
    traceStep(
      "trigger",
      "completed",
      `${titleCase(context.source)} trigger accepted.`,
    ),
  );

  const condition = evaluateAutomationCondition(job.condition, context.payload);
  if (!condition.matched) {
    trace.push(traceStep("condition", "skipped", condition.detail));
    return storage.appendRun(job, {
      output: condition.detail,
      status: "skipped",
      triggerType: context.source,
      actionType: job.action?.type ?? "prompt",
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      trace,
    });
  }

  trace.push(traceStep("condition", "completed", condition.detail));

  let output: string;
  let status: AutomationRunStatus = "completed";
  try {
    output = await executor(job, context);
    trace.push(
      traceStep(
        "action",
        "completed",
        `${titleCase(job.action?.type ?? "prompt")} action completed.`,
      ),
    );
  } catch (error) {
    status = "failed";
    output = `Automation failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    trace.push(traceStep("action", "failed", output));
  }

  trace.push(
    traceStep("delivery", status, deliveryMessage(job.delivery, status)),
  );
  const completedAt = new Date();
  return storage.appendRun(job, {
    output,
    status,
    triggerType: context.source,
    actionType: job.action?.type ?? "prompt",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    trace,
  });
}

function traceStep(
  phase: AutomationTracePhase,
  status: AutomationRunStatus,
  message: string,
): AutomationTraceStep {
  return {
    id: randomUUID(),
    phase,
    status,
    message,
    createdAt: new Date().toISOString(),
  };
}

function deliveryMessage(
  delivery: CronJobRecord["delivery"],
  status: AutomationRunStatus,
): string {
  if (status === "failed") {
    return "Failure receipt recorded.";
  }
  if (delivery === "home") {
    return "Agent output handed to configured home delivery.";
  }
  if (delivery === "local") {
    return "Agent output persisted to the local automation archive.";
  }
  return "Agent output retained in the originating runtime.";
}

function titleCase(value: string): string {
  return value
    .replace(/-/gu, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}
