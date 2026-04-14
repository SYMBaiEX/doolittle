import type { CliExecutionResult } from "@/cli/execution";
import { executeCliInput, getCliErrorMessage } from "@/cli/execution";
import { currentSessionElapsed } from "@/cli/shell-chrome";
import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import { defaultNowStamp, isConversationalInput } from "./render";
import type { PlainCliLoopOptions, PlainCliLoopResult } from "./types";

function resolveInputEntry(line: string, at: string): ResponseTranscriptEntry {
  const kind: ResponseTranscriptEntry["kind"] = isConversationalInput(line)
    ? "user"
    : line.startsWith("!")
      ? "shell"
      : "command";

  return {
    label: kind === "user" ? "You" : kind === "shell" ? "Shell" : "Command",
    body: line,
    at,
    kind,
  };
}

function resolveResultEntryKind(
  line: string,
  tone: CliExecutionResult["tone"],
): ResponseTranscriptEntry["kind"] {
  if (tone === "agent") {
    return "assistant";
  }
  if (line.startsWith("!")) {
    return "shell";
  }
  if (line.startsWith("/")) {
    return "command";
  }
  return "assistant";
}

function resolveResultLabel(
  line: string,
  agentName: string,
  tone: CliExecutionResult["tone"],
): string {
  if (tone === "agent") {
    return agentName;
  }
  if (line.startsWith("!")) {
    return "Shell";
  }
  if (line.startsWith("/")) {
    return "Command Result";
  }
  return agentName;
}

export async function processPlainCliLine(
  options: PlainCliLoopOptions,
): Promise<PlainCliLoopResult> {
  const {
    context,
    state,
    interactiveShell,
    line,
    responseHistory,
    executionState,
    pushPlainEntry,
    persistTranscript,
    nowStamp = defaultNowStamp,
    executeInput = executeCliInput,
    getElapsed = currentSessionElapsed,
    getErrorText = getCliErrorMessage,
  } = options;

  responseHistory.push(resolveInputEntry(line, nowStamp()));
  persistTranscript(responseHistory);

  try {
    executionState.activeTurnAbortController = new AbortController();
    const result = await executeInput(line, context, state, {
      abortSignal: executionState.activeTurnAbortController.signal,
    });
    if (result.text) {
      pushPlainEntry(
        {
          label: resolveResultLabel(
            line,
            context.config.agentName,
            result.tone,
          ),
          body: result.text,
          at: nowStamp(),
          elapsed: getElapsed(context, state.activeSessionId),
          kind: resolveResultEntryKind(line, result.tone),
        },
        result.tone,
      );
    }
    return {
      shouldExit: !interactiveShell || result.shouldExit === true,
    };
  } catch (error) {
    pushPlainEntry(
      {
        label: "Error",
        body: getErrorText(error),
        at: nowStamp(),
        elapsed: getElapsed(context, state.activeSessionId),
        kind: "system",
      },
      "error",
    );
    return { shouldExit: false };
  } finally {
    executionState.activeTurnAbortController = null;
    executionState.turnCancellationPending = false;
  }
}
