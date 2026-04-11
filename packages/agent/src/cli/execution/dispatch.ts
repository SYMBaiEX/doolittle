import type { AppContext } from "@/runtime/bootstrap";
import { executeSlashCommand, handleAgentTurn } from "@/runtime/chat";
import {
  canonicalizeSlashCommandSyntax,
  normalizeSlashCommandSyntax,
} from "@/runtime/command-catalog";
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

  if (
    normalizedTrimmed.startsWith("/") &&
    !normalizedTrimmed.startsWith("/resume ") &&
    normalizedTrimmed !== "/resume" &&
    !normalizedTrimmed.startsWith("/title ")
  ) {
    const response = await executeSlashCommand(
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
        runLocalShellCommand: async ({
          command,
          afterSuccessConnectProvider,
        }) => {
          const result = await runCliShellFlow(
            context,
            command,
            hooks,
            afterSuccessConnectProvider
              ? async () =>
                  executeSlashCommand(
                    {
                      message: canonicalizeSlashCommandSyntax(
                        `/accounts connect ${afterSuccessConnectProvider}`,
                      ),
                      userId: "local-user",
                      roomId: state.activeSessionId,
                      source: "cli",
                    },
                    context,
                  )
              : undefined,
          );
          return result.text;
        },
      },
    );
    if (response !== undefined) {
      return { text: response, tone: "info" };
    }
  }
  const sessionResult = handleCliSessionCommand(
    normalizedTrimmed,
    context,
    state,
  );
  if (sessionResult) {
    return sessionResult;
  }

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
    },
  );

  return { text: response, tone: "agent" };
}
