import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ActionResult } from "@elizaos/core";
import {
  actionResultActionName,
  extractCommandResultFromActionResult,
  extractLocalMutationsFromActionResult,
} from "@/runtime/action-result-metadata";
import { isRecord } from "@/utils/records";

const LOCAL_MUTATION_ACTIONS = new Set([
  "WRITE_FILE",
  "PATCH_FILE",
  "CREATE_DIRECTORY",
]);

const EXPLICIT_NOOP_COMPLETION =
  /\b(?:already\s+(?:fully\s+)?(?:complete|completed|implemented|satisf(?:ies|ied)|meets?|fulfills?|in\s+place|working)|(?:current|existing)\s+(?:implementation|application|app|project|setup)\s+(?:already\s+)?(?:is\s+)?(?:complete|implemented|satisf(?:ies|ied)|meets?|fulfills?|works|in\s+place)|no\s+(?:additional\s+)?(?:changes?|edits?|modifications?)\s+(?:were|are|was)\s+(?:needed|required|necessary)|nothing\s+(?:needed|needs)\s+to\s+(?:change|be\s+changed)|everything\s+(?:requested\s+)?is\s+already\s+in\s+place)\b/iu;

export interface VerifiedWorkspaceNoopCompletion {
  workdir: string;
  verificationKinds: string[];
  bunInstallVerified: boolean;
  buildVerified: boolean;
  url?: string;
  sessionId?: string;
}

export interface WorkspaceNoopRequirements {
  requireBunInstall: boolean;
  requireBuild: boolean;
  requireManagedApplication: boolean;
}

export function workspaceNoopRequirements(
  userRequest: string,
): WorkspaceNoopRequirements {
  const requireManagedApplication =
    /\b(?:start|launch|serve|preview|open)\b[\s\S]{0,80}\b(?:app|application|dev\s+server|development\s+server|website|web\s+app|site)\b|\b(?:app|application|dev\s+server|development\s+server|website|web\s+app|site)\b[\s\S]{0,80}\b(?:start|launch|serve|preview|open)\b|\brun\s+(?:the\s+)?(?:app|application|dev\s+server|website|web\s+app|site)\b/iu.test(
      userRequest,
    );
  return {
    requireBunInstall:
      /\bbun\b[\s\S]{0,60}\b(?:install(?:ation)?|add)\b|\b(?:install(?:ation)?|add)\b[\s\S]{0,60}\bbun\b|\b(?:use|using|with|via)\s+(?:the\s+)?bun\b|\bbun\s+run\s+(?:dev|start|build)\b/iu.test(
        userRequest,
      ),
    // Starting an app is not a meaningful handoff until its production build
    // has passed. Make that prerequisite explicit even if the user did not
    // separately say “build”.
    requireBuild:
      /\b(?:production\s+)?build\b/iu.test(userRequest) ||
      requireManagedApplication,
    requireManagedApplication,
  };
}

function absoluteDirectory(value: unknown): string | undefined {
  if (typeof value !== "string" || !isAbsolute(value)) return undefined;
  return resolve(value);
}

function sameDirectory(value: unknown, expected: string): boolean {
  const directory = absoluteDirectory(value);
  return directory === expected;
}

function shellDirectory(command: string): string | undefined {
  const match = command.match(
    /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&]+))\s*&&/u,
  );
  const directory = match?.[1] ?? match?.[2] ?? match?.[3];
  return directory ? absoluteDirectory(directory) : undefined;
}

/**
 * `executedIn` is the process launch directory, not necessarily the effective
 * workspace when a shell command explicitly changes directories. Honor a
 * leading `cd … &&` before falling back to that launch-directory receipt.
 */
function commandDirectory(command: {
  command: string;
  executedIn?: string;
}): string | undefined {
  return (
    shellDirectory(command.command) ?? absoluteDirectory(command.executedIn)
  );
}

function successfulShellCommands(actionResults: readonly ActionResult[]) {
  return actionResults.flatMap((result, index) => {
    if (
      result.success !== true ||
      actionResultActionName(result)?.toUpperCase() !== "SHELL"
    ) {
      return [];
    }
    const commandResult = extractCommandResultFromActionResult(result);
    if (commandResult?.exitCode !== 0 || commandResult.success !== true) {
      return [];
    }
    return [{ index, ...commandResult }];
  });
}

function completedChangedDelegation(
  actionResults: readonly ActionResult[],
): { index: number; workdir: string } | undefined {
  return actionResults.reduce<{ index: number; workdir: string } | undefined>(
    (latest, result, index) => {
      if (
        result.success !== true ||
        actionResultActionName(result)?.toUpperCase() !== "TASKS_SPAWN_AGENT"
      ) {
        return latest;
      }
      const receipt = result.data?.delegatedExecution;
      const workdir = isRecord(receipt)
        ? absoluteDirectory(receipt.workdir)
        : undefined;
      if (
        !isRecord(receipt) ||
        receipt.status !== "completed" ||
        receipt.stopReason !== "end_turn" ||
        (receipt.exitCode !== null && receipt.exitCode !== 0) ||
        receipt.verifiedLocalMutation !== true ||
        !Array.isArray(receipt.changedFiles) ||
        receipt.changedFiles.length === 0 ||
        !workdir
      ) {
        return latest;
      }
      return { index, workdir };
    },
    undefined,
  );
}

function isWithinDirectory(path: string, directory: string): boolean {
  const resolvedPath = resolve(path);
  const resolvedDirectory = resolve(directory);
  const pathFromDirectory = relative(resolvedDirectory, resolvedPath);
  return (
    pathFromDirectory === "" ||
    (!pathFromDirectory.startsWith(`..${sep}`) && pathFromDirectory !== "..")
  );
}

function sharedMutationDirectory(paths: readonly string[]): string | undefined {
  const directories = paths.map((path) => dirname(resolve(path)));
  if (directories.length === 0) return undefined;
  let segments = directories[0]?.split(sep) ?? [];
  for (const directory of directories.slice(1)) {
    const nextSegments = directory.split(sep);
    let commonLength = 0;
    while (
      commonLength < segments.length &&
      segments[commonLength] === nextSegments[commonLength]
    ) {
      commonLength += 1;
    }
    segments = segments.slice(0, commonLength);
  }
  const joined = segments.join(sep);
  return joined || sep;
}

function successfulBuildCommand(command: string, requireBun: boolean): boolean {
  return requireBun
    ? /\bbun\s+run\s+build\b/u.test(command)
    : /\b(?:bun\s+run|npm\s+run|pnpm\s+run|yarn)\s+build\b/u.test(command);
}

/**
 * Report any explicit post-edit acceptance steps that are still missing.
 * A coding delegate's changed-file receipt proves that files changed, not that
 * a requested install/build/server handoff succeeded. Parent shell and app
 * server receipts must be successful, occur after that delegate, and point at
 * its exact absolute workspace.
 */
export function missingWorkspaceMutationRequirements(
  actionResults: readonly ActionResult[],
  requirements: WorkspaceNoopRequirements,
): string[] {
  if (
    !requirements.requireBunInstall &&
    !requirements.requireBuild &&
    !requirements.requireManagedApplication
  ) {
    return [];
  }

  const mutationReceipts = actionResults.flatMap((result, index) => {
    if (result.success !== true) return [];
    const mutations = extractLocalMutationsFromActionResult(result).filter(
      (mutation) => mutation.success && mutation.resolvedPath,
    );
    return mutations.map((mutation) => ({
      index,
      path: resolve(mutation.resolvedPath as string),
    }));
  });
  if (mutationReceipts.length === 0) {
    return ["a completed changed-file receipt for the intended workspace"];
  }
  const latestMutationIndex = Math.max(
    ...mutationReceipts.map((mutation) => mutation.index),
  );
  const changedPaths = mutationReceipts.map((mutation) => mutation.path);
  const delegation = completedChangedDelegation(actionResults);
  if (
    delegation &&
    !changedPaths.every((path) => isWithinDirectory(path, delegation.workdir))
  ) {
    return [
      `verified changed-file receipts contained within ${delegation.workdir}`,
    ];
  }
  const postMutationCommands = successfulShellCommands(actionResults).filter(
    (command) => command.index > latestMutationIndex,
  );
  const appServerDirectories = actionResults.flatMap((result, index) => {
    if (
      index <= latestMutationIndex ||
      result.success !== true ||
      actionResultActionName(result)?.toUpperCase() !==
        "DOOLITTLE_APP_SERVER" ||
      !isRecord(result.data) ||
      !isRecord(result.data.session)
    ) {
      return [];
    }
    const directory = absoluteDirectory(result.data.session.cwd);
    return directory ? [directory] : [];
  });
  const operationDirectories = [
    ...(delegation ? [delegation.workdir] : []),
    ...postMutationCommands.flatMap((command) => {
      const directory = commandDirectory(command);
      return directory ? [directory] : [];
    }),
    ...appServerDirectories,
    sharedMutationDirectory(changedPaths),
  ].filter((directory): directory is string => Boolean(directory));
  const workspaceDirectory = operationDirectories.find((directory) =>
    changedPaths.every((path) => isWithinDirectory(path, directory)),
  );
  if (!workspaceDirectory) {
    return ["a verifiable workspace root containing all changed files"];
  }

  const commands = postMutationCommands.filter(
    (command) => commandDirectory(command) === workspaceDirectory,
  );
  const installCommand = commands.find((command) =>
    /\bbun\s+(?:install|i)\b/u.test(command.command),
  );
  const buildCommand = commands.find((command) =>
    successfulBuildCommand(command.command, requirements.requireBunInstall),
  );
  const missing: string[] = [];

  if (requirements.requireBunInstall && !installCommand) {
    missing.push(`a successful Bun install in ${workspaceDirectory}`);
  }
  if (requirements.requireBuild && !buildCommand) {
    missing.push(`a successful production build in ${workspaceDirectory}`);
  }
  if (
    requirements.requireBunInstall &&
    requirements.requireBuild &&
    installCommand &&
    buildCommand &&
    (installCommand.index > buildCommand.index ||
      (installCommand.index === buildCommand.index &&
        installCommand.command.search(/\bbun\s+(?:install|i)\b/u) >
          buildCommand.command.search(/\bbun\s+run\s+build\b/u)))
  ) {
    missing.push("Bun install before the production build");
  }

  if (requirements.requireManagedApplication) {
    const requiredStepIndex = Math.max(
      installCommand?.index ?? -1,
      buildCommand?.index ?? -1,
      latestMutationIndex,
    );
    const readyServer = actionResults.some((result, index) => {
      if (
        index <= requiredStepIndex ||
        result.success !== true ||
        actionResultActionName(result)?.toUpperCase() !==
          "DOOLITTLE_APP_SERVER" ||
        !isRecord(result.data) ||
        result.data.status !== "ready" ||
        !isRecord(result.data.session) ||
        !sameDirectory(result.data.session.cwd, workspaceDirectory) ||
        typeof result.data.session.command !== "string" ||
        !/^bun\s+run\s+dev(?:\s|$)/u.test(result.data.session.command)
      ) {
        return false;
      }
      return Boolean(localUrl(result.data.url));
    });
    if (!readyServer) {
      missing.push(
        `a ready managed app server with a verified local URL in ${workspaceDirectory}`,
      );
    }
  }

  return missing;
}

/** Confirm a completed Bun build in the exact workspace after coding ends. */
export function hasSuccessfulWorkspaceBuild(
  actionResults: readonly ActionResult[],
  workdir: string,
): boolean {
  const expected = absoluteDirectory(workdir);
  if (!expected) return false;
  const latestCompletedDelegation = actionResults.reduce(
    (latest, result, index) => {
      if (
        result.success !== true ||
        actionResultActionName(result)?.toUpperCase() !== "TASKS_SPAWN_AGENT"
      ) {
        return latest;
      }
      const receipt = result.data?.delegatedExecution;
      if (
        !isRecord(receipt) ||
        receipt.status !== "completed" ||
        receipt.stopReason !== "end_turn" ||
        absoluteDirectory(receipt.workdir) !== expected
      ) {
        return latest;
      }
      return index;
    },
    -1,
  );
  return successfulShellCommands(actionResults).some((command) => {
    const directory = commandDirectory(command);
    return (
      command.index > latestCompletedDelegation &&
      directory === expected &&
      /\bbun\s+run\s+build\b/u.test(command.command)
    );
  });
}

function localUrl(value: unknown): URL | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)
    ) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

const VERIFICATION_COMMAND =
  /\b(?:bun|npm|pnpm|yarn)\s+(?:(?:run|x)\s+)?(?:build|test|check|lint|typecheck|type-check|validate|verify)\b|\bgit\s+diff\s+--check\b/iu;

function hasLocalMutationAction(actionResults: readonly ActionResult[]) {
  return actionResults.some((result) => {
    const data = result.data;
    return (
      LOCAL_MUTATION_ACTIONS.has(
        actionResultActionName(result)?.toUpperCase() ?? "",
      ) ||
      (isRecord(data) &&
        typeof data.mutationAction === "string" &&
        LOCAL_MUTATION_ACTIONS.has(data.mutationAction.toUpperCase()))
    );
  });
}

/**
 * Accept a no-edit result only when a completed coding delegate explicitly
 * attests that the requested state already exists and Doolittle independently
 * verifies install/build and a managed server in the same exact workspace.
 * The app-server's `ready` state is issued only after its own HTTP GET probe
 * succeeds; requiring a second shell curl after that probe is redundant. This
 * is evidence of a satisfied task, not a synthetic file-mutation receipt.
 */
export function verifyWorkspaceNoopCompletion(
  actionResults: readonly ActionResult[],
  requirements: WorkspaceNoopRequirements = {
    requireBunInstall: false,
    requireBuild: false,
    requireManagedApplication: false,
  },
): VerifiedWorkspaceNoopCompletion | undefined {
  if (hasLocalMutationAction(actionResults)) return undefined;

  const delegatedResults = actionResults.flatMap((result, index) => {
    if (actionResultActionName(result)?.toUpperCase() !== "TASKS_SPAWN_AGENT") {
      return [];
    }
    const receipt = result.data?.delegatedExecution;
    if (!isRecord(receipt)) return [];
    const changedFiles = receipt.changedFiles;
    if (
      result.success !== true ||
      receipt.status !== "completed" ||
      receipt.stopReason !== "end_turn" ||
      (receipt.exitCode !== null && receipt.exitCode !== 0) ||
      receipt.verifiedLocalMutation !== false ||
      !Array.isArray(changedFiles) ||
      changedFiles.length !== 0
    ) {
      return [];
    }

    const workdir = absoluteDirectory(receipt.workdir);
    // Only the delegated agent's report can attest that a zero-change pass
    // found the requested state already present. The parent action wrapper
    // contains instructions about how to report a no-op; those instructions
    // must never be mistaken for evidence that a no-op actually occurred.
    const report = typeof receipt.summary === "string" ? receipt.summary : "";
    if (!workdir || !EXPLICIT_NOOP_COMPLETION.test(report)) return [];
    return [{ index, workdir }];
  });

  if (delegatedResults.length === 0) return undefined;

  // A sibling or later coding attempt may have failed after partially editing
  // the workspace. Never let a no-op report hide that incomplete attempt.
  const hasConflictingDelegation = actionResults.some((result) => {
    if (actionResultActionName(result)?.toUpperCase() !== "TASKS_SPAWN_AGENT") {
      return false;
    }
    const receipt = result.data?.delegatedExecution;
    if (!isRecord(receipt)) return result.success === false;
    return (
      result.success === false ||
      receipt.status !== "completed" ||
      receipt.verifiedLocalMutation === true ||
      (Array.isArray(receipt.changedFiles) && receipt.changedFiles.length > 0)
    );
  });
  if (hasConflictingDelegation) return undefined;

  const commands = successfulShellCommands(actionResults);
  for (const delegation of delegatedResults) {
    const scopedCommands = commands.filter((command) => {
      const directory = commandDirectory(command);
      return directory === delegation.workdir;
    });
    const taskVerificationCommands = scopedCommands.filter(
      (command) =>
        command.index > delegation.index &&
        VERIFICATION_COMMAND.test(command.command),
    );
    const installCommand = scopedCommands.find(
      (command) =>
        command.index > delegation.index &&
        /\bbun\s+(?:install|i)\b/u.test(command.command),
    );
    const buildCommand = scopedCommands.find(
      (command) =>
        command.index > delegation.index &&
        /\bbun\s+run\s+build\b/u.test(command.command),
    );
    if (
      taskVerificationCommands.length === 0 ||
      (requirements.requireBunInstall && !installCommand) ||
      (requirements.requireBuild && !buildCommand)
    ) {
      continue;
    }
    if (
      requirements.requireBunInstall &&
      requirements.requireBuild &&
      installCommand &&
      buildCommand
    ) {
      const installPrecedesBuild =
        installCommand.index < buildCommand.index ||
        (installCommand.index === buildCommand.index &&
          installCommand.command.search(/\bbun\s+(?:install|i)\b/u) <
            buildCommand.command.search(/\bbun\s+run\s+build\b/u));
      if (!installPrecedesBuild) continue;
    }
    const requiredVerificationIndex = Math.max(
      ...taskVerificationCommands.map((command) => command.index),
      installCommand?.index ?? -1,
      buildCommand?.index ?? -1,
    );

    const readyServers = actionResults.flatMap((result, index) => {
      if (
        index <= requiredVerificationIndex ||
        result.success !== true ||
        actionResultActionName(result)?.toUpperCase() !==
          "DOOLITTLE_APP_SERVER" ||
        !isRecord(result.data) ||
        result.data.status !== "ready" ||
        !isRecord(result.data.session) ||
        !sameDirectory(result.data.session.cwd, delegation.workdir) ||
        typeof result.data.session.command !== "string" ||
        !/^bun\s+run\s+dev(?:\s|$)/u.test(result.data.session.command)
      ) {
        return [];
      }
      const url = localUrl(result.data.url);
      return url ? [{ index, url, sessionId: result.data.session.id }] : [];
    });
    const readyServer = requirements.requireManagedApplication
      ? readyServers.find((server) => server.index > requiredVerificationIndex)
      : undefined;
    if (requirements.requireManagedApplication && !readyServer) continue;

    return {
      workdir: delegation.workdir,
      verificationKinds: Array.from(
        new Set(
          taskVerificationCommands.map(({ command }) =>
            /\bbuild\b/iu.test(command)
              ? "build"
              : /\btest\b/iu.test(command)
                ? "tests"
                : /\btype-?check\b/iu.test(command)
                  ? "typecheck"
                  : /\blint\b/iu.test(command)
                    ? "lint"
                    : /\bgit\s+diff\s+--check\b/iu.test(command)
                      ? "diff check"
                      : "workspace verification",
          ),
        ),
      ).slice(-3),
      bunInstallVerified: Boolean(installCommand),
      buildVerified: Boolean(buildCommand),
      ...(readyServer
        ? {
            url: readyServer.url.toString(),
            ...(typeof readyServer.sessionId === "string"
              ? { sessionId: readyServer.sessionId }
              : {}),
          }
        : {}),
    };
  }

  return undefined;
}
