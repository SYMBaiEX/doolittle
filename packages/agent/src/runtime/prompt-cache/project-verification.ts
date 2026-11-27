import { realpath } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import type { TerminalCommandRecord } from "@doolittle/contracts/execution";
import {
  extractSessionContext,
  type IAgentRuntime,
  type Memory,
} from "@elizaos/core";
import type { AppServices } from "../../services/index";
import { isRecord } from "../../utils/records";
import {
  getScopedTurnAbortSignal,
  hasScopedTurnActionReceipts,
} from "../turn-runtime-scope";
import {
  currentConversationWorkspace,
  isDesktopWorkspaceRuntime,
} from "../workspace-scope";
import { hashStableJson } from "./digest";

const TEST_COMMANDS: ReadonlySet<string> = new Set([
  "bun run test",
  "bun test",
  "cargo test",
  "go test ./...",
  "npm run test",
  "npm test",
  "nub run test",
  "pnpm run test",
  "pnpm test",
  "pytest",
  "yarn test",
]);
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const OPTIONAL_CACHE_BUDGET_MS = 50;

type ProjectWorkspaceServices = Pick<AppServices, "sessions" | "workspace">;
type TerminalVerification = Pick<
  TerminalCommandRecord,
  | "command"
  | "backend"
  | "backendMode"
  | "cwd"
  | "exitCode"
  | "timedOut"
  | "completedAt"
>;

async function verificationWorkspace(
  services: ProjectWorkspaceServices,
  runtime: IAgentRuntime,
  message: Memory,
): Promise<{ key: string; directory: string } | undefined> {
  const source = message.content.source;
  if (
    (source !== "desktop" && source !== "cli") ||
    !message.entityId ||
    !hasScopedTurnActionReceipts(runtime) ||
    getScopedTurnAbortSignal(runtime)?.aborted
  )
    return undefined;

  const sessionId = extractSessionContext(message)?.sessionId;
  if (!sessionId) return undefined;

  const desktop = currentConversationWorkspace();
  let directory: string;
  let projectId: string | undefined;
  if (desktop || isDesktopWorkspaceRuntime()) {
    if (
      source !== "desktop" ||
      !desktop?.projectId ||
      desktop.sessionId !== sessionId
    )
      return undefined;
    directory = desktop.workspacePath;
    projectId = desktop.projectId;
  } else {
    if (source !== "cli") return undefined;
    projectId = services.sessions.projectIdForSession(sessionId);
    directory = await realpath(services.workspace.root());
    if (projectId) {
      const project = services.sessions.getProject(projectId);
      if (
        !project?.primaryPath ||
        project.archivedAt ||
        (await realpath(project.primaryPath)) !== directory
      )
        return undefined;
    }
  }

  const scope = hashStableJson([
    source,
    runtime.agentId,
    desktop?.botId,
    message.entityId,
    projectId,
    directory,
  ]);
  return { key: `doolittle/project-verification/v1/${scope}`, directory };
}

async function withinCacheBudget<T>(
  work: () => Promise<T>,
): Promise<T | undefined> {
  const timeout = new AbortController();
  try {
    return await Promise.race([
      work(),
      delay(OPTIONAL_CACHE_BUDGET_MS, undefined, {
        signal: timeout.signal,
        ref: false,
      }),
    ]);
  } catch {
    // Optional context must never change the outcome of a completed command.
    return undefined;
  } finally {
    timeout.abort();
  }
}

function isFresh(completedAt: unknown): completedAt is number {
  if (typeof completedAt !== "number") return false;
  const age = Date.now() - completedAt;
  return age >= 0 && age <= MAX_AGE_MS;
}

/** Remember one successful check in ElizaOS, with no output or transcript. */
export async function rememberProjectVerification(
  services: ProjectWorkspaceServices,
  runtime: IAgentRuntime,
  message: Memory,
  record: TerminalVerification,
): Promise<void> {
  const { command, backend, backendMode, exitCode, timedOut } = record;
  if (
    backend !== "local" ||
    backendMode !== "local" ||
    exitCode !== 0 ||
    timedOut ||
    !TEST_COMMANDS.has(command)
  )
    return;
  const completedAt = Date.parse(record.completedAt);
  if (!isFresh(completedAt)) return;

  await withinCacheBudget(async () => {
    const workspace = await verificationWorkspace(services, runtime, message);
    if (
      workspace &&
      (await realpath(record.cwd)) === workspace.directory &&
      !getScopedTurnAbortSignal(runtime)?.aborted
    )
      await runtime.setCache(workspace.key, { check: command, completedAt });
  });
}

export function buildProjectVerificationContext(
  services: ProjectWorkspaceServices,
  runtime: IAgentRuntime,
  message: Memory,
): Promise<string | undefined> {
  return withinCacheBudget(async () => {
    const workspace = await verificationWorkspace(services, runtime, message);
    if (!workspace) return undefined;
    const evidence = await runtime.getCache<unknown>(workspace.key);
    if (
      !isRecord(evidence) ||
      typeof evidence.check !== "string" ||
      !TEST_COMMANDS.has(evidence.check) ||
      !isFresh(evidence.completedAt)
    )
      return undefined;
    return `A previous local run of \`${evidence.check}\` exited successfully in this workspace. Check that it applies to the current task and rerun it before claiming current verification.`;
  });
}
