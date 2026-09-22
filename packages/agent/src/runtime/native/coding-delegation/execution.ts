import { resolve } from "node:path";
import { isRecord } from "@/utils/records";
import { DelegationEvidence } from "./evidence";
import type {
  AcpSession,
  AcpSpawnOptions,
  CodingDelegationServices,
  DelegatedExecutionReceipt,
  DelegatedToolObservation,
  ManagedAcpService,
} from "./types";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function delegationFailureMessage(
  agentType: string,
  reason: string,
): string {
  if (reason.includes("CODING_WORKSPACE_MISMATCH"))
    return `${agentType} selected a different workspace than the requested directory. The worker was stopped before receiving the task. Check the selected project path and retry; no fallback directory was accepted.`;
  if (/auth|credential|login|sign.?in|unauthorized|401|403/i.test(reason)) {
    return `${agentType} could not authenticate. Sign in to ${agentType} in Settings → Providers & accounts, then retry. No other provider was selected automatically.`;
  }
  if (/permission|approval|denied|blocked/i.test(reason)) {
    return `${agentType} needs workspace or command permission. Review the coding-agent permissions in Settings, then retry the task.`;
  }
  if (/timeout|timed out/i.test(reason))
    return `${agentType} timed out before completing the task. Review the observed changes and retry to continue.`;
  if (/cancel|stopped|abort/i.test(reason))
    return "The coding task was stopped. Existing changes were preserved; retry to continue.";
  return `${agentType} stopped before completing the task. Review the tool activity and provider status, then retry. No successful completion was recorded.`;
}

export async function executeManagedDelegation(input: {
  service: ManagedAcpService;
  options: AcpSpawnOptions;
  model?: string;
  roomId: string;
  services: CodingDelegationServices;
  signal?: AbortSignal;
}): Promise<{ session: AcpSession; receipt: DelegatedExecutionReceipt }> {
  const { service, options, services, roomId, signal } = input;
  const run = services.runController.getByRoomId(roomId);
  const current = () =>
    !signal?.aborted &&
    (!run || services.runController.getByRoomId(roomId)?.runId === run.runId);
  const task = text(options.initialTask);
  if (!task.trim()) throw new Error("CODING_TASK_MISSING");
  signal?.throwIfAborted();
  const evidence = new DelegationEvidence(text(options.workdir));
  // The official router owns connector-origin children. This child is awaited
  // by its existing desktop turn, so retaining router keys would start a second
  // parent turn on every completion/error and duplicate chat messages.
  const metadata = { ...options.metadata };
  for (const key of [
    "roomId",
    "taskRoomId",
    "originRoomId",
    "worktreeRoomId",
    "swarmRooms",
    "source",
    "originConnectorMessageId",
    "initialTask",
  ])
    delete metadata[key];
  metadata.doolittleParentRoomId = roomId;
  if (run) metadata.doolittleParentRunId = run.runId;
  const session = await service.spawnSession({
    ...options,
    initialTask: undefined,
    model: input.model,
    // Native beta.7 cannot cancel before session creation. Bound startup and
    // check cancellation before sending any coding prompt.
    timeoutMs: Math.min(options.timeoutMs ?? 30_000, 30_000),
    metadata,
  });
  if (
    signal?.aborted ||
    resolve(session.workdir) !== resolve(text(options.workdir))
  ) {
    await service.stopSession(session.sessionId);
    signal?.throwIfAborted();
    throw new Error("CODING_WORKSPACE_MISMATCH");
  }
  // ACP may prepare AGENTS.md/identity files while creating a session. Those
  // are harness setup, not implementation evidence for the user's task.
  await evidence.start();
  const tools = new Map<string, DelegatedToolObservation>();
  const pendingEvidence: Promise<void>[] = [];
  let response = "";
  let eventFailure = "";
  let lastProgress = 0;
  let cancellation: Promise<void> | undefined;
  let closure: Promise<void> | undefined;
  const close = () => (closure ??= service.stopSession(session.sessionId));
  const cancel = () => {
    cancellation ??= service
      .cancelSession(session.sessionId)
      .catch(() => undefined)
      .then(close)
      .catch(() => undefined);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const unsubscribe = service.onSessionEvent((sessionId, event, data) => {
    if (sessionId !== session.sessionId || !current() || !isRecord(data))
      return;
    if (event === "message") {
      response = `${response}${text(data.text)}`.slice(-64_000);
      if (Date.now() - lastProgress >= 250) {
        services.runController.noteRuntimeStream(
          roomId,
          "action",
          `${session.agentType}: ${response.slice(-300)}`,
        );
        lastProgress = Date.now();
      }
    } else if (event === "tool_running" && isRecord(data.toolCall)) {
      const tool = data.toolCall;
      const id = text(tool.id);
      if (!id || (tools.size >= 200 && !tools.has(id))) return;
      const previous = tools.get(id);
      const observed = {
        id,
        title: text(tool.title) || previous?.title || "Coding tool",
        kind: text(tool.kind) || previous?.kind || "other",
        status: text(tool.status) || "running",
      };
      tools.set(id, observed);
      services.runController.noteRuntimeStream(
        roomId,
        "action",
        `${session.agentType}: ${observed.title.slice(0, 250)} (${observed.status})`,
      );
      if (run)
        services.runController.appendTaskEvent(run.runId, "delegation.tool", {
          sessionId,
          ...observed,
        });
      // Capture before an edit, never treat a post-edit existence check as proof.
      if (
        !previous &&
        !["completed", "failed", "error"].includes(observed.status) &&
        ["edit", "delete", "move"].includes(observed.kind)
      ) {
        for (const location of Array.isArray(tool.locations)
          ? tool.locations
          : []) {
          if (isRecord(location) && text(location.path))
            pendingEvidence.push(evidence.track(text(location.path)));
        }
        const rawInput = isRecord(tool.rawInput) ? tool.rawInput : {};
        for (const key of ["path", "file_path", "filePath"])
          if (text(rawInput[key]))
            pendingEvidence.push(evidence.track(text(rawInput[key])));
      }
    } else if (["error", "blocked", "login_required"].includes(event)) {
      eventFailure = text(data.message) || event;
      services.runController.noteRuntimeStream(
        roomId,
        "action",
        delegationFailureMessage(session.agentType, eventFailure),
      );
      if (event !== "error") cancel();
    }
  });
  let stopReason = "error";
  let exitCode: number | null = null;
  try {
    if (!signal?.aborted) {
      const result = await service.sendPrompt(session.sessionId, task, {
        model: input.model,
        timeoutMs: options.timeoutMs ?? 20 * 60_000,
      });
      stopReason = result.stopReason ?? "unknown";
      exitCode = result.exitCode ?? null;
      eventFailure ||= result.error ?? "";
    }
  } catch (error) {
    eventFailure ||= error instanceof Error ? error.message : "provider error";
  } finally {
    unsubscribe();
    signal?.removeEventListener("abort", cancel);
    await cancellation;
    // Close only this worker. Stop waits for provider cleanup before the parent
    // can accept a retry, preventing late detached writes from the old session.
    await close().catch(() => {
      eventFailure ||= "Coding session cleanup failed";
    });
  }
  await Promise.all(pendingEvidence);
  const changedFiles = await evidence.finish();
  const cancelled =
    signal?.aborted || stopReason === "cancelled" || stopReason === "stopped";
  const completed =
    !cancelled &&
    !eventFailure &&
    stopReason === "end_turn" &&
    (exitCode === null || exitCode === 0);
  const status = cancelled ? "cancelled" : completed ? "completed" : "failed";
  const failureMessage = completed
    ? undefined
    : delegationFailureMessage(
        session.agentType,
        cancelled ? "cancelled" : eventFailure || stopReason,
      );
  const receipt: DelegatedExecutionReceipt = {
    sessionId: session.sessionId,
    agentType: session.agentType,
    workdir: session.workdir,
    status,
    stopReason,
    exitCode,
    summary: response.trim(),
    failureMessage,
    observedTools: [...tools.values()],
    changedFiles,
    verifiedLocalMutation: changedFiles.length > 0,
  };
  if (run)
    services.runController.appendTaskEvent(
      run.runId,
      "delegation.completed",
      receipt,
    );
  return { session: { ...session, status }, receipt };
}
