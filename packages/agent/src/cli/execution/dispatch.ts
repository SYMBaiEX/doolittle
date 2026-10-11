import type { AppContext } from "@/runtime/bootstrap";
import { handleAgentTurn } from "@/runtime/chat";
import { normalizeSlashCommandSyntax } from "@/runtime/command-catalog";
import { connectLinkedProvider } from "@/runtime/linked-provider-accounts";
import { stableRuntimeUuid } from "@/runtime/stable-runtime-uuid";
import { handleCliJobCommand } from "./job-commands";
import { handleCliSessionCommand } from "./session-commands";
import { runCliShellFlow } from "./shell-flow";
import { resolveStaticCliInput } from "./static";
import type { CliExecutionHooks, CliExecutionResult, CliState } from "./types";

export async function executeCliInput(
  line: string,
  context: AppContext,
  state: CliState,
  hooks?: CliExecutionHooks,
): Promise<CliExecutionResult> {
  const normalizedTrimmed = normalizeSlashCommandSyntax(line.trim());
  const isExplicitSlashCommand = normalizedTrimmed.startsWith("/");
  const staticResult = resolveStaticCliInput(
    line,
    context.config.agentName,
    context.config.workspaceDir,
  );
  if (staticResult) {
    return staticResult;
  }

  const jobResult = await handleCliJobCommand(
    normalizedTrimmed,
    context,
    state,
    hooks,
  );
  if (jobResult) {
    return jobResult;
  }

  const sessionResult = handleCliSessionCommand(
    normalizedTrimmed,
    context,
    state,
  );
  if (sessionResult) {
    return sessionResult;
  }

  const nativeRoomId = stableRuntimeUuid(state.activeSessionId);
  const previousRunId =
    context.services.runController?.getByRoomId(nativeRoomId)?.runId;
  const response = await handleAgentTurn(
    {
      message: normalizedTrimmed,
      userId: "local-user",
      roomId: state.activeSessionId,
      source: "cli",
    },
    context,
    {
      onResponseProgress: ({ response }) =>
        hooks?.onResponseProgress?.({ response }),
      onNotice: (notice) => hooks?.onNotice?.(notice),
      abortSignal: hooks?.abortSignal,
      runLocalShellCommand: async ({
        command,
        afterSuccessConnectProvider,
      }) => {
        const result = await runCliShellFlow(
          context,
          command,
          hooks,
          afterSuccessConnectProvider
            ? async () => {
                const connection = await connectLinkedProvider(
                  context,
                  afterSuccessConnectProvider,
                );
                return connection.connected && connection.activated
                  ? `${afterSuccessConnectProvider} is now connected and active.`
                  : `${afterSuccessConnectProvider} login completed, but the provider is not ready to activate yet. ${connection.advice.detail}`;
              }
            : undefined,
        );
        return result.text;
      },
    },
  );

  const receipt = context.services.runController?.getByRoomId(nativeRoomId);
  const ownedReceipt =
    receipt &&
    receipt.runId !== previousRunId &&
    receipt.sessionId === state.activeSessionId &&
    receipt.source === "cli";
  const status = ownedReceipt
    ? receipt.status === "error"
      ? "failed"
      : receipt.status === "cancelled"
        ? "cancelled"
        : receipt.status === "complete"
          ? "completed"
          : undefined
    : undefined;
  return {
    text: response,
    tone:
      status === "failed" ? "error" : isExplicitSlashCommand ? "info" : "agent",
    ...(status ? { status } : {}),
  };
}
