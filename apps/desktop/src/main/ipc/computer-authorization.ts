import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import type { ComputerOwnerScope } from "../../shared/contracts/editor";
import type { BackendManager } from "../backend";
import type { BotProcessRegistry } from "../bot-process-registry";
import type { DesktopExecutionAdmission } from "../execution-admission";
import { isRecord } from "./input-validation";

const BOT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const CONVERSATION_ID = /^[a-zA-Z0-9:_-]{1,128}$/u;

export function validateComputerOwnerScope(value: unknown): ComputerOwnerScope {
  if (!isRecord(value)) throw new Error("Computer request is invalid.");
  const { botId, originConversationId, workspacePath } = value;
  if (
    botId === undefined &&
    originConversationId === undefined &&
    workspacePath === undefined
  ) {
    return {};
  }
  if (
    typeof botId !== "string" ||
    !BOT_ID.test(botId) ||
    typeof originConversationId !== "string" ||
    !CONVERSATION_ID.test(originConversationId) ||
    typeof workspacePath !== "string" ||
    !workspacePath ||
    workspacePath.length > 4_096
  ) {
    throw new Error(
      "Computer requests require a bot, originating conversation, and workspace.",
    );
  }
  return { botId, originConversationId, workspacePath };
}

export interface AuthorizedComputerRequest {
  backend: Pick<BackendManager, "getState">;
  /** Release a mutation seat after the backend effect completes. */
  release: () => void;
}

/** Validate ownership again after a native confirmation, immediately before dispatch. */
export async function authorizeComputerRequest(
  scope: ComputerOwnerScope,
  dependencies: {
    backend: Pick<BackendManager, "getState">;
    bots?: BotProcessRegistry;
    admission?: DesktopExecutionAdmission;
    defaultWorkspaceRoot?: string;
  },
  mutation: boolean,
): Promise<AuthorizedComputerRequest> {
  const botId = scope.botId ?? "default";
  if (botId !== "default" && !dependencies.bots)
    throw new Error("Named bots are unavailable.");
  let mutationRoot: string | undefined;
  if (scope.botId !== undefined) {
    if (
      !dependencies.bots ||
      !scope.originConversationId ||
      !scope.workspacePath
    ) {
      throw new Error("Computer ownership is incomplete.");
    }
    await dependencies.bots.ensureConversationOwner(
      botId,
      scope.originConversationId,
    );
    mutationRoot = dependencies.bots.assertAcpWorkspace(
      botId,
      scope.workspacePath,
    );
    if (mutation && !dependencies.bots.get(botId).permissions.allowMutation) {
      throw new Error("This bot is not allowed to modify its workspace.");
    }
  }
  const backend = dependencies.bots
    ? await dependencies.bots.backendFor(botId)
    : dependencies.backend;
  if (!mutation) return { backend, release: () => undefined };
  if (!dependencies.admission) {
    if (botId !== "default")
      throw new Error("Computer mutation admission is unavailable.");
    return { backend, release: () => undefined };
  }
  if (!mutationRoot) {
    if (!dependencies.defaultWorkspaceRoot)
      throw new Error(
        "The lead workspace is unavailable for mutation admission.",
      );
    mutationRoot = realpathSync(dependencies.defaultWorkspaceRoot);
  }
  const runId = `desktop-write:${randomUUID()}`;
  const ownerBotId = dependencies.bots?.get(botId).id ?? botId;
  const result = dependencies.admission.claim({
    botId: ownerBotId,
    runId,
    sessionId: scope.originConversationId ?? runId,
    kind: "foreground",
    mutationRoot,
  });
  if (!result.accepted)
    throw new Error(`Computer write unavailable: ${result.reason}.`);
  return {
    backend,
    release: () => {
      dependencies.admission?.release({
        botId: ownerBotId,
        runId,
        leaseId: result.leaseId,
      });
    },
  };
}
