import { createHash } from "node:crypto";
import type { RunToolActivity } from "@doolittle/contracts/run";
import type { IAgentRuntime } from "@elizaos/core";
import type { AppServices } from "../../../services/index";
import type { RunSnapshot } from "../../../services/run-controller-service/index";
import { projectNativeActionInputTarget } from "../../tool-activity";
import { getScopedTurnRunId } from "../../turn-runtime-scope";

type OwnerToolExecutionObservation = Parameters<
  NonNullable<IAgentRuntime["ownerToolExecutionObserver"]>
>[0];

const MAX_TRACKED_RUNS = 128;
const MAX_TRACKED_INVOCATIONS = 256;

interface PendingInvocation {
  id: string;
  action: string;
  observed: boolean;
  uncorrelated: boolean;
  completed: boolean;
  startedAtMs: number;
}

interface PendingRun {
  invocations: PendingInvocation[];
}

function nativeInvocationId(runId: string, sequence: number): string {
  return `native:${createHash("sha256")
    .update(JSON.stringify([runId, sequence]))
    .digest("hex")
    .slice(0, 24)}`;
}

/**
 * Correlates the SDK's two native tool surfaces without inventing identity:
 * ACTION_STARTED has no tool-call id or arguments, while the owner execution
 * observation has arguments but no room. A target is applied only when exactly
 * one unobserved invocation of that action can own it in this Doolittle run.
 */
class NativeToolActivityProjector {
  private readonly runs = new Map<string, PendingRun>();

  constructor(private readonly services: AppServices) {}

  private invocationsFor(runId: string): PendingInvocation[] {
    let pending = this.runs.get(runId);
    if (!pending) {
      pending = { invocations: [] };
      this.runs.set(runId, pending);
      if (this.runs.size > MAX_TRACKED_RUNS) {
        const oldest = this.runs.keys().next().value;
        if (oldest) this.runs.delete(oldest);
      }
    }
    return pending.invocations;
  }

  actionStarted(run: RunSnapshot, action: string): RunToolActivity {
    const invocations = this.invocationsFor(run.runId);
    const sequence = run.observedActionCount + 1;
    const invocation: PendingInvocation = {
      id: nativeInvocationId(run.runId, sequence),
      action,
      observed: false,
      uncorrelated: false,
      completed: false,
      startedAtMs: Date.now(),
    };
    invocations.push(invocation);
    if (invocations.length > MAX_TRACKED_INVOCATIONS) invocations.shift();
    return { id: invocation.id, action, phase: "running" };
  }

  actionCompleted(
    run: RunSnapshot,
    action: string | undefined,
    activity: RunToolActivity,
  ): RunToolActivity {
    const invocations = this.runs.get(run.runId)?.invocations;
    if (!invocations || !action) return activity;
    const open = invocations.filter(
      (invocation) => invocation.action === action && !invocation.completed,
    );
    if (open.length === 0) return activity;

    const exact =
      open.length === 1 && !open[0].uncorrelated ? open[0] : undefined;
    if (open.length > 1) {
      for (const invocation of open) invocation.uncorrelated = true;
    }
    open[0].completed = true;
    const remaining = invocations.filter((invocation) => !invocation.completed);
    if (remaining.length) {
      this.runs.set(run.runId, { invocations: remaining });
    } else {
      this.runs.delete(run.runId);
    }
    if (!exact) return activity;
    return {
      ...activity,
      id: exact.id,
      durationMs:
        activity.durationMs ?? Math.max(0, Date.now() - exact.startedAtMs),
    };
  }

  observeOwnerExecution(observation: OwnerToolExecutionObservation): void {
    if (
      observation.phase !== "started" ||
      observation.gate !== "execution" ||
      observation.gateOutcome !== "executed"
    )
      return;
    const runId = getScopedTurnRunId();
    if (!runId) return;
    const receipt = this.services.runController.getByRunId(runId);
    if (!receipt) return;
    const run = this.services.runController.getByRoomId(receipt.roomId);
    if (!run || run.runId !== runId || run.endedAt) return;
    const invocations = this.runs.get(runId)?.invocations;
    if (!invocations) return;
    const candidates = invocations.filter(
      (invocation) =>
        invocation.action === observation.actionName &&
        !invocation.observed &&
        !invocation.uncorrelated &&
        !invocation.completed,
    );
    // Parallel invocations of one action have no shared correlation key in the
    // native events. Leaving both targetless is honest; guessing is not.
    if (candidates.length !== 1) return;
    const invocation = candidates[0];
    invocation.observed = true;
    const target = projectNativeActionInputTarget(
      invocation.action,
      observation.args,
      this.services.workspace.root(),
    );
    if (!target.command && !target.paths?.length) return;
    this.services.runController.noteRuntimeActionProgress(run.roomId, runId, {
      ...target,
      id: invocation.id,
      action: invocation.action,
      phase: "running",
    });
  }
}

const projectors = new WeakMap<AppServices, NativeToolActivityProjector>();

export function nativeToolActivityProjector(
  services: AppServices,
): NativeToolActivityProjector {
  let projector = projectors.get(services);
  if (!projector) {
    projector = new NativeToolActivityProjector(services);
    projectors.set(services, projector);
  }
  return projector;
}

export function installNativeToolExecutionObserver(
  runtime: IAgentRuntime,
  services: AppServices,
): IAgentRuntime["ownerToolExecutionObserver"] {
  if (
    runtime.ownerToolExecutionObserverVersion !== 1 ||
    runtime.ownerToolExecutionObserver
  )
    return undefined;
  const projector = nativeToolActivityProjector(services);
  const observer: NonNullable<IAgentRuntime["ownerToolExecutionObserver"]> = (
    observation,
  ) => {
    projector.observeOwnerExecution(observation);
  };
  runtime.ownerToolExecutionObserver = observer;
  return observer;
}
