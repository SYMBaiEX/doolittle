import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import { readPlainLoopLine } from "./input";
import { processPlainCliLine } from "./process-line";
import { createPlainEntryWriter } from "./render";
import type { PlainPromptLoopOptions } from "./types";

export async function runPlainPromptLoop(
  options: PlainPromptLoopOptions,
): Promise<void> {
  const {
    rl,
    output,
    context,
    state,
    interactiveShell,
    lifecycleState,
    resetLastRenderedRunEventKey,
  } = options;
  const responseHistory: ResponseTranscriptEntry[] = [];
  const { pushPlainEntry, persistTranscript } = createPlainEntryWriter({
    context,
    interactiveShell,
    output,
    responseHistory,
  });

  while (true) {
    const line = await readPlainLoopLine({
      rl,
      interactiveShell,
      context,
      state,
      lifecycleState,
    });

    if (line === null) {
      break;
    }
    if (!line) {
      continue;
    }

    resetLastRenderedRunEventKey();
    const result = await processPlainCliLine({
      context,
      state,
      interactiveShell,
      line,
      responseHistory,
      executionState: lifecycleState,
      pushPlainEntry,
      persistTranscript,
    });
    if (result.shouldExit) {
      break;
    }
  }
}
