import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentExecutionContext } from "../chat";

const OPERATOR_STEER_PREFIX = "operator-steer: ";
const MAX_OPERATOR_STEER_NOTES = 8;
const MAX_OPERATOR_STEER_CHARS = 12_000;

/** Returns only reviewed operator directions, capped for the worker boundary. */
export function getBoundedOperatorSteeringNotes(
  notes: readonly string[] | undefined,
): string[] {
  if (!notes?.length) return [];

  const selected: string[] = [];
  let used = 0;
  for (const note of [...notes].reverse()) {
    if (!note.startsWith(OPERATOR_STEER_PREFIX)) continue;
    const instruction = note.slice(OPERATOR_STEER_PREFIX.length).trim();
    if (!instruction || instruction.length > 4000) continue;
    if (
      selected.length >= MAX_OPERATOR_STEER_NOTES ||
      used + instruction.length > MAX_OPERATOR_STEER_CHARS
    ) {
      continue;
    }
    selected.push(instruction);
    used += instruction.length;
  }
  return selected.reverse();
}

export function buildDelegationWorkerSpawnOptions(input: {
  workerEntry: string;
  inputPath: string;
  outputPath: string;
  workspaceRoot: string;
  env?: Record<string, string | undefined>;
}): {
  cmd: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: "pipe";
  stderr: "pipe";
} {
  return {
    cmd: ["bun", "run", input.workerEntry, input.inputPath, input.outputPath],
    cwd: input.workspaceRoot,
    env: {
      ...(input.env ?? process.env),
      DOOLITTLE_WORKSPACE_DIR: input.workspaceRoot,
    },
    stdout: "pipe" as const,
    stderr: "pipe" as const,
  };
}

export async function resolveDelegationWorkspaceRoot(input: {
  configuredWorkspace: string;
  requestedRoot?: string;
  resolveWorktreeRoot: (value: unknown) => Promise<string>;
}): Promise<string> {
  if (!input.requestedRoot) return input.configuredWorkspace;
  return input.resolveWorktreeRoot(input.requestedRoot);
}

export async function runDelegationTaskInWorker(
  context: AgentExecutionContext,
  taskId: string,
  options?: { assumeRunning?: boolean },
): Promise<ReturnType<AgentExecutionContext["services"]["delegation"]["get"]>> {
  const task = context.services.delegation.get(taskId);
  // Validate again immediately before launch. A worktree can be pruned or
  // replaced after task creation, so persisted approval is not sufficient.
  const workspaceRoot = await resolveDelegationWorkspaceRoot({
    configuredWorkspace: context.config.workspaceDir,
    requestedRoot: task.workspaceRoot,
    resolveWorktreeRoot: (value) =>
      context.services.repository.resolveWorktreeRoot(value),
  });
  const { inputPath, outputPath } = context.services.delegation.getWorkerPaths(
    task.id,
  );
  writeFileSync(
    inputPath,
    JSON.stringify(
      {
        taskId: task.id,
        objective: task.objective,
        group: task.group,
        profile: task.profile,
        priority: task.priority,
        tags: task.tags,
        labels: task.labels,
        metadata: task.metadata,
        parentTaskId: task.parentTaskId,
        workspaceRoot,
        operatorSteering: getBoundedOperatorSteeringNotes(task.notes),
      },
      null,
      2,
    ),
    "utf8",
  );

  const workerEntry = join(import.meta.dir, "../delegate-worker.ts");
  const proc = Bun.spawn(
    buildDelegationWorkerSpawnOptions({
      workerEntry,
      inputPath,
      outputPath,
      workspaceRoot,
    }),
  );
  if (!options?.assumeRunning) {
    context.services.delegation.markRunning(task.id);
  }
  context.services.delegation.markWorkerStarted(task.id, {
    pid: proc.pid,
    mode: "process",
    outputPath,
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const rawOutput = readFileSync(outputPath, "utf8");
  const parsed = JSON.parse(rawOutput) as {
    ok: boolean;
    output?: string;
    error?: string;
    workerPid?: number;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    workspaceRoot?: string;
  };

  if (exitCode === 0 && parsed.ok) {
    const completedTask = context.services.delegation.complete(
      task.id,
      parsed.output ?? (stdout.trim() || "Worker finished without output."),
    );
    context.services.delegation.addNote(
      task.id,
      `system: worker report pid=${parsed.workerPid ?? proc.pid} duration=${parsed.durationMs ?? "n/a"}ms workspace=${workspaceRoot} output=${outputPath}`,
    );
    return completedTask;
  }

  const failedTask = context.services.delegation.fail(
    task.id,
    parsed.error ||
      stderr.trim() ||
      `Delegation worker exited with code ${exitCode}`,
  );
  context.services.delegation.addNote(
    task.id,
    `system: worker stderr=${stderr.trim() || "(empty)"} workspace=${workspaceRoot} output=${outputPath}`,
  );
  return failedTask;
}
