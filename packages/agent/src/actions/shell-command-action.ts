import type {
  Action,
  ActionResult,
  AgentRuntime,
  IAgentRuntime,
  Memory,
  ShortcutDefinition,
} from "@elizaos/core";
import {
  executeTerminalCommand,
  formatTerminalCommandResponse,
  requestTerminalCommandApprovalDetails,
} from "@/runtime/commands/shell-command-facade";
import { getScopedTurnAbortSignal } from "@/runtime/turn-runtime-scope";
import type { AppServices } from "@/services";
import type { ChatTurnRequest, EnvConfig } from "@/types/runtime";
import { messageText } from "@/utils/eliza-compat";

export const DOOLITTLE_SHELL_SHORTCUT_ACTION = "DOOLITTLE_SHELL_SHORTCUT";

function messageSource(message: Memory): string {
  if (typeof message.content !== "string" && message.content?.source) {
    return String(message.content.source);
  }
  const metadata = message.metadata as
    | { doolittle?: { source?: unknown } }
    | undefined;
  return typeof metadata?.doolittle?.source === "string"
    ? metadata.doolittle.source
    : "api";
}

export function parseExplicitShellCommand(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed.startsWith("!") ? trimmed.slice(1).trim() : undefined;
}

function matchesRegisteredShellShortcut(
  runtime: IAgentRuntime,
  text: string,
): boolean {
  const shortcutRegistry = (
    runtime as IAgentRuntime & Pick<AgentRuntime, "shortcutRegistry">
  ).shortcutRegistry;
  const match = shortcutRegistry.match(text, {
    actions: runtime.actions.map((action) => action.name),
    allowNatural: false,
  });
  return (
    match?.shortcut.target.kind === "action" &&
    match.shortcut.target.name === DOOLITTLE_SHELL_SHORTCUT_ACTION
  );
}

export function createShellCommandShortcut(): ShortcutDefinition {
  return {
    id: "doolittle-shell-command",
    kind: "explicit",
    aliases: ["!"],
    target: { kind: "action", name: DOOLITTLE_SHELL_SHORTCUT_ACTION },
    requiresAction: DOOLITTLE_SHELL_SHORTCUT_ACTION,
    priority: 60,
  };
}

function shellCommandInput(message: Memory): ChatTurnRequest {
  const metadata = message.metadata as { sessionId?: unknown } | undefined;
  return {
    message: messageText(message),
    userId: String(message.entityId),
    roomId:
      typeof metadata?.sessionId === "string"
        ? metadata.sessionId
        : String(message.roomId),
    source: messageSource(message),
  };
}

function throwIfShellActionAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw (
    signal.reason ??
    new DOMException("The shell command was cancelled.", "AbortError")
  );
}

async function deliverShellApproval(
  callback: (() => Promise<unknown> | unknown) | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  throwIfShellActionAborted(signal);
  if (!callback) return;
  if (!signal) {
    await callback();
    return;
  }

  const delivery = Promise.resolve(callback()).then(() => undefined);
  let removeAbortListener: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    const rejectForAbort = () => {
      try {
        throwIfShellActionAborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    if (signal.aborted) {
      rejectForAbort();
      return;
    }
    signal.addEventListener("abort", rejectForAbort, { once: true });
    removeAbortListener = () =>
      signal.removeEventListener("abort", rejectForAbort);
  });

  try {
    await Promise.race([delivery, aborted]);
  } finally {
    removeAbortListener();
  }
  throwIfShellActionAborted(signal);
}

async function denyCreatedApprovalAfterAbort(
  services: AppServices,
  approval: { id: string; created: boolean },
): Promise<void> {
  if (!approval.created) return;
  try {
    await services.executionApprovals.deny(approval.id);
  } catch {
    // Cancellation must preserve its AbortError even if approval cleanup is
    // unavailable; the approval service retains its normal expiry fallback.
  }
}

export function createShellCommandAction(
  services: AppServices,
  config: EnvConfig,
): Action {
  return {
    name: DOOLITTLE_SHELL_SHORTCUT_ACTION,
    description:
      "Executes an explicit ! shell command through the Eliza shortcut, action, permission, and service lifecycle.",
    similes: [],
    // The handler emits the canonical terminal result itself. Let the SDK own
    // the action lifecycle, but do not ask a planner to add a second reply.
    suppressPostActionContinuation: true,
    suppressEarlyReply: true,
    validate: async (runtime, message) =>
      matchesRegisteredShellShortcut(runtime, messageText(message)),
    handler: async (
      runtime,
      message,
      _state,
      _options,
      callback,
    ): Promise<ActionResult> => {
      const command = parseExplicitShellCommand(messageText(message));
      if (!command) {
        const text = "Usage: !<shell command>";
        await callback?.({ text, source: "doolittle-shell-command" });
        return {
          success: false,
          text,
          error: "SHELL_COMMAND_REQUIRED",
          userFacingText: text,
          verifiedUserFacing: true,
        };
      }

      const abortSignal = getScopedTurnAbortSignal(runtime);
      throwIfShellActionAborted(abortSignal);
      const input = shellCommandInput(message);
      const context = { config, services, runtime };
      const approval = await requestTerminalCommandApprovalDetails(
        input,
        context,
        command,
      );
      if (abortSignal?.aborted) {
        if (approval) await denyCreatedApprovalAfterAbort(services, approval);
        throwIfShellActionAborted(abortSignal);
      }
      if (approval) {
        try {
          await deliverShellApproval(
            () =>
              callback?.({
                text: approval.prompt,
                source: "doolittle-shell-command",
              }),
            abortSignal,
          );
        } catch (error) {
          if (abortSignal?.aborted) {
            await denyCreatedApprovalAfterAbort(services, approval);
          }
          throw error;
        }
        throwIfShellActionAborted(abortSignal);
        services.runController.setPendingApprovals(
          input.roomId ?? String(message.roomId),
          1,
        );
        return {
          success: true,
          text: approval.prompt,
          userFacingText: approval.prompt,
          verifiedUserFacing: true,
          data: {
            actionName: DOOLITTLE_SHELL_SHORTCUT_ACTION,
            command,
            pendingApproval: true,
          },
        };
      }

      try {
        const result = await executeTerminalCommand(
          runtime,
          services,
          command,
          abortSignal,
        );
        throwIfShellActionAborted(abortSignal);
        const text = formatTerminalCommandResponse(result);
        await callback?.({ text, source: "doolittle-shell-command" });
        return {
          success: result.exitCode === 0,
          text,
          userFacingText: text,
          verifiedUserFacing: true,
          data: {
            actionName: DOOLITTLE_SHELL_SHORTCUT_ACTION,
            command: result.command,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            cwd: result.cwd,
            durationMs: result.durationMs,
          },
        };
      } catch (error) {
        if (abortSignal?.aborted) throw error;
        const text = `Shell command failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
        await callback?.({ text, source: "doolittle-shell-command" });
        return {
          success: false,
          text,
          error: error instanceof Error ? error.message : String(error),
          userFacingText: text,
          verifiedUserFacing: true,
          data: {
            actionName: DOOLITTLE_SHELL_SHORTCUT_ACTION,
            command,
          },
        };
      }
    },
  };
}
