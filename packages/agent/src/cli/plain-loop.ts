import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Interface } from "node:readline/promises";
import {
  type CliExecutionResult,
  type CliState,
  executeCliInput,
  getCliErrorMessage,
} from "@/cli/execution";
import { currentSessionElapsed, renderPlainPrompt } from "@/cli/shell-chrome";
import {
  type ResponseTranscriptEntry,
  renderPlainEntry,
  renderPlainTranscript,
} from "@/cli/transcript-renderer";
import type { AppContext } from "@/runtime/bootstrap";

export interface PlainCliLoopExecutionState {
  activeTurnAbortController: AbortController | null;
  turnCancellationPending: boolean;
}

interface PlainCliLoopOptions {
  context: AppContext;
  state: CliState;
  interactiveShell: boolean;
  line: string;
  responseHistory: ResponseTranscriptEntry[];
  executionState: PlainCliLoopExecutionState;
  pushPlainEntry: (
    entry: ResponseTranscriptEntry,
    tone?: CliExecutionResult["tone"],
  ) => void;
  persistTranscript: (history: ResponseTranscriptEntry[]) => void;
  nowStamp?: () => string;
  executeInput?: typeof executeCliInput;
  getElapsed?: typeof currentSessionElapsed;
  getErrorText?: typeof getCliErrorMessage;
}

interface PlainCliLoopResult {
  shouldExit: boolean;
}

interface PlainPromptLoopOptions {
  rl: Interface;
  output: NodeJS.WriteStream;
  context: AppContext;
  state: CliState;
  interactiveShell: boolean;
  lifecycleState: PlainCliLoopExecutionState & { closed: boolean };
  resetLastRenderedRunEventKey: () => void;
}

function defaultNowStamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isConversationalInput(text: string): boolean {
  const trimmed = text.trim();
  return !!trimmed && !trimmed.startsWith("/") && !trimmed.startsWith("!");
}

function writeTranscriptExport(
  context: AppContext,
  history: ResponseTranscriptEntry[],
): void {
  try {
    writeFileSync(
      join(context.config.dataDir, "latest-transcript.txt"),
      `${renderPlainTranscript(history)}\n`,
      "utf8",
    );
  } catch {
    // Best effort only.
  }
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

  const entryAt = nowStamp();
  const entryKind: ResponseTranscriptEntry["kind"] = isConversationalInput(line)
    ? "user"
    : line.startsWith("!")
      ? "shell"
      : "command";
  const entryLabel =
    entryKind === "user" ? "You" : entryKind === "shell" ? "Shell" : "Command";

  responseHistory.push({
    label: entryLabel,
    body: line,
    at: entryAt,
    kind: entryKind,
  });
  persistTranscript(responseHistory);

  try {
    executionState.activeTurnAbortController = new AbortController();
    const result = await executeInput(line, context, state, {
      abortSignal: executionState.activeTurnAbortController.signal,
    });
    if (result.text) {
      pushPlainEntry(
        {
          label:
            result.tone === "agent"
              ? context.config.agentName
              : line.startsWith("!")
                ? "Shell"
                : line.startsWith("/")
                  ? "Command Result"
                  : context.config.agentName,
          body: result.text,
          at: nowStamp(),
          elapsed: getElapsed(context, state.activeSessionId),
          kind:
            result.tone === "agent"
              ? "assistant"
              : line.startsWith("!")
                ? "shell"
                : line.startsWith("/")
                  ? "command"
                  : "assistant",
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
  const pushPlainEntry = (
    entry: ResponseTranscriptEntry,
    tone?: CliExecutionResult["tone"],
  ) => {
    responseHistory.push(entry);
    if (responseHistory.length > 48) {
      responseHistory.splice(0, responseHistory.length - 48);
    }
    writeTranscriptExport(context, responseHistory);
    if (!interactiveShell) {
      output.write(`${entry.body.trim()}\n`);
      return;
    }
    output.write(`\n${renderPlainEntry(entry, tone)}\n\n`);
  };

  while (true) {
    let line = "";
    try {
      line = (
        await rl.question(
          interactiveShell ? renderPlainPrompt(context, state) : "",
        )
      ).trim();
    } catch (error) {
      if (
        lifecycleState.closed ||
        (error instanceof Error &&
          "code" in error &&
          error.code === "ERR_USE_AFTER_CLOSE")
      ) {
        break;
      }
      throw error;
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
      persistTranscript: (history) => {
        writeTranscriptExport(context, history);
      },
    });
    if (result.shouldExit) {
      break;
    }
  }
}
