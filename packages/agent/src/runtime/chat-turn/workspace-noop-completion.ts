import { isAbsolute, resolve } from "node:path";
import type { ActionResult } from "@elizaos/core";
import {
  actionResultActionName,
  extractCommandResultFromActionResult,
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
  return {
    requireBunInstall:
      /\bbun\b[\s\S]{0,60}\b(?:install(?:ation)?|add)\b|\b(?:install(?:ation)?|add)\b[\s\S]{0,60}\bbun\b/iu.test(
        userRequest,
      ),
    requireBuild: /\b(?:production\s+)?build\b/iu.test(userRequest),
    requireManagedApplication:
      /\b(?:start|launch|serve|preview|open)\b[\s\S]{0,80}\b(?:app|application|dev\s+server|development\s+server|website|web\s+app|site)\b|\b(?:app|application|dev\s+server|development\s+server|website|web\s+app|site)\b[\s\S]{0,80}\b(?:start|launch|serve|preview|open)\b|\brun\s+(?:the\s+)?(?:app|application|dev\s+server|website|web\s+app|site)\b/iu.test(
        userRequest,
      ),
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

function sameLocalEndpoint(candidate: URL, expected: URL): boolean {
  return (
    candidate.protocol === expected.protocol &&
    candidate.port === expected.port &&
    candidate.pathname === expected.pathname &&
    candidate.search === expected.search
  );
}

function commandContainsUrl(command: string, expected: URL): boolean {
  if (!/\bcurl\b/u.test(command)) return false;
  // `--fail` (including common short forms such as -fsS) is required so a
  // 4xx/5xx page cannot be mistaken for a successful HTTP verification.
  if (
    !/(?:^|\s)--fail(?:\s|$)|(?:^|\s)-[a-zA-Z]*f[a-zA-Z]*(?:\s|$)/u.test(
      command,
    )
  ) {
    return false;
  }
  return [...command.matchAll(/https?:\/\/[^\s"'<>`]+/gu)].some((match) => {
    const value = match[0]?.replace(/[),.;]+$/u, "");
    if (!value) return false;
    const candidate = localUrl(value);
    return candidate ? sameLocalEndpoint(candidate, expected) : false;
  });
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
 * verifies install/build, the managed server, and that server's HTTP URL in
 * the same exact workspace. This is evidence of a satisfied task, not a
 * synthetic file-mutation receipt.
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
    const report = [receipt.summary, result.text]
      .filter((value): value is string => typeof value === "string")
      .join("\n");
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
      const directory =
        absoluteDirectory(command.executedIn) ??
        shellDirectory(command.command);
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
      ? readyServers.find((server) =>
          scopedCommands.some(
            (command) =>
              command.index > server.index &&
              commandContainsUrl(command.command, server.url),
          ),
        )
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
