import { renderPlainPrompt } from "../shell-chrome";
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
  if (lifecycleState.closed) return null;

  // Closing readline can leave an already pending question unresolved.
  const controller = new AbortController();
  const cancelQuestion = () => controller.abort();
  rl.once("close", cancelQuestion);
  try {
    return (
      await rl.question(
        interactiveShell ? renderPlainPrompt(context, state) : "",
        { signal: controller.signal },
      )
    ).trim();
  } catch (error) {
    if (controller.signal.aborted || isReadlineClosedError(error)) {
      return null;
    }
    throw error;
  } finally {
    rl.removeListener("close", cancelQuestion);
  }
}
