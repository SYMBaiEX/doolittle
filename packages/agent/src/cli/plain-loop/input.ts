import { renderPlainPrompt } from "@/cli/shell-chrome";
import type { PlainPromptLoopOptions } from "./types";

function isReadlineClosedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ERR_USE_AFTER_CLOSE"
  );
}

type PlainLineReaderOptions = Pick<
  PlainPromptLoopOptions,
  "rl" | "interactiveShell" | "context" | "state" | "lifecycleState"
>;

export async function readPlainLoopLine(
  options: PlainLineReaderOptions,
): Promise<string | null> {
  const { rl, interactiveShell, context, state, lifecycleState } = options;

  try {
    return (
      await rl.question(
        interactiveShell ? renderPlainPrompt(context, state) : "",
      )
    ).trim();
  } catch (error) {
    if (lifecycleState.closed || isReadlineClosedError(error)) {
      return null;
    }
    throw error;
  }
}
