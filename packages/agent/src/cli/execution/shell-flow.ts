import type { AppContext } from "@/runtime/bootstrap";
import type { CliExecutionHooks, CliExecutionResult } from "./types";

export async function runCliShellFlow(
  context: Pick<AppContext, "services">,
  command: string,
  hooks?: CliExecutionHooks,
  onSuccess?: () => Promise<string | undefined>,
): Promise<CliExecutionResult> {
  const result = await context.services.terminal.runStreamingLocal(
    command,
    {
      onStdout: (chunk) => {
        hooks?.onStream?.({
          source: "stdout",
          chunk,
          command,
        });
      },
      onStderr: (chunk) => {
        hooks?.onStream?.({
          source: "stderr",
          chunk,
          command,
        });
      },
    },
    undefined,
    hooks?.abortSignal,
  );
  const followUp =
    result.exitCode === 0 && onSuccess ? await onSuccess() : undefined;
  return {
    text: [
      `$ ${result.command}`,
      "",
      result.stdout || "(no stdout)",
      result.stderr ? `\n[stderr]\n${result.stderr}` : "",
      `\nexit=${result.exitCode} duration=${result.durationMs ?? "n/a"}ms`,
      followUp ? `\n${followUp}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    tone: result.exitCode === 0 ? "success" : "warning",
  };
}
