import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ActionResult } from "@elizaos/core";
import { isRecord } from "../../utils/records";
import { inspectWorkspaceCommands } from "../../utils/workspace-commands";
import {
  actionResultActionName,
  extractCommandResultFromActionResult,
  extractLocalMutationsFromActionResult,
} from "../action-result-metadata";
import {
  missingWorkspaceMutationRequirements as missingVerifiedWorkspaceRequirements,
  verifyWorkspaceNoopCompletion as verifyChronologicalWorkspaceNoop,
  type WorkspaceNoopRequirements,
} from "./workspace-noop-completion";

export function chronologyUnverified(result: ActionResult): boolean {
  return result.data?.doolittleReceiptChronologyUnverified === true;
}

// Keep unidentified SDK observations in the transcript and as invalidation
// barriers, but never let their claimed readiness certify completion. Preserve
// positions and later-session invalidation in the existing verification helper.
function verificationActionResults(
  results: readonly ActionResult[],
): ActionResult[] {
  return results.map((result) =>
    chronologyUnverified(result) ? { ...result, success: false } : result,
  );
}

export function missingWorkspaceMutationRequirements(
  ...[results, requirements]: Parameters<
    typeof missingVerifiedWorkspaceRequirements
  >
) {
  return missingVerifiedWorkspaceRequirements(
    verificationActionResults(results),
    requirements,
  );
}

export function verifyWorkspaceNoopCompletion(
  ...[results, requirements]: Parameters<
    typeof verifyChronologicalWorkspaceNoop
  >
) {
  return verifyChronologicalWorkspaceNoop(
    verificationActionResults(results),
    requirements,
  );
}

export function hasVerifiedWorkspaceMutation(
  actionResults: readonly ActionResult[],
  workdir?: string,
): boolean {
  return actionResults.some(
    (result) =>
      result.success === true &&
      extractLocalMutationsFromActionResult(result).some(
        (mutation) =>
          mutation.success &&
          (!workdir || withinWorkspace(mutation.resolvedPath, workdir)),
      ),
  );
}

function withinWorkspace(path: string | undefined, workdir: string): boolean {
  if (typeof path !== "string" || !isAbsolute(path) || !isAbsolute(workdir))
    return false;
  const suffix = relative(resolve(workdir), resolve(path));
  return suffix === "" || (suffix !== ".." && !suffix.startsWith(`..${sep}`));
}

/** Pin the task's receipt-backed directory before later actions can widen it. */
export function admittedWorkspace(
  actionResults: readonly ActionResult[],
  configuredWorkspace: string | undefined,
): string | undefined {
  const mutations = actionResults
    .flatMap(extractLocalMutationsFromActionResult)
    .filter((mutation) => mutation.success);
  const paths = mutations
    .map((mutation) => mutation.resolvedPath)
    .filter(
      (path): path is string => typeof path === "string" && isAbsolute(path),
    );
  const belongs = (directory: unknown): directory is string =>
    typeof directory === "string" &&
    isAbsolute(directory) &&
    resolve(directory) !== sep &&
    paths.length > 0 &&
    paths.every((path) => withinWorkspace(path, directory));
  for (const result of [...actionResults].reverse()) {
    const delegated = result.data?.delegatedExecution;
    if (
      actionResultActionName(result) === "TASKS_SPAWN_AGENT" &&
      isRecord(delegated) &&
      delegated.verifiedLocalMutation === true &&
      belongs(delegated.workdir)
    )
      return resolve(delegated.workdir);
    if (result.success !== true) continue;
    const command = extractCommandResultFromActionResult(result);
    if (
      actionResultActionName(result) === "SHELL" &&
      command?.success === true &&
      command.exitCode === 0
    ) {
      const directory = inspectWorkspaceCommands(
        command.command,
        command.executedIn,
      ).find((operation) => belongs(operation.directory))?.directory;
      if (directory) return resolve(directory);
    }
    const session = result.data?.session;
    if (
      actionResultActionName(result) === "DOOLITTLE_APP_SERVER" &&
      isRecord(session) &&
      session.managed === true &&
      belongs(session.cwd)
    )
      return resolve(session.cwd);
  }
  if (
    typeof configuredWorkspace === "string" &&
    isAbsolute(configuredWorkspace) &&
    resolve(configuredWorkspace) !== sep &&
    paths.every((path) => withinWorkspace(path, configuredWorkspace))
  )
    return resolve(configuredWorkspace);
  // With no root receipt, accept only corrections inside the original shared
  // mutation directory. Do not guess a broader project from a path string.
  let directory = paths[0] ? dirname(paths[0]) : undefined;
  while (
    directory &&
    !paths.every((path) => withinWorkspace(path, directory as string))
  )
    directory = dirname(directory);
  return directory && directory !== sep ? directory : undefined;
}

export function hasVerifiedWorkspaceCompletion(
  actionResults: readonly ActionResult[],
  requirements: WorkspaceNoopRequirements,
): boolean {
  if (hasVerifiedWorkspaceMutation(actionResults)) {
    return (
      missingWorkspaceMutationRequirements(actionResults, requirements)
        .length === 0
    );
  }
  return Boolean(verifyWorkspaceNoopCompletion(actionResults, requirements));
}
