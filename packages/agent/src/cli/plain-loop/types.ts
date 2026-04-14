import type { Interface } from "node:readline/promises";
import type {
  CliExecutionResult,
  CliState,
  executeCliInput,
  getCliErrorMessage,
} from "@/cli/execution";
import type { currentSessionElapsed } from "@/cli/shell-chrome";
import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import type { AppContext } from "@/runtime/bootstrap";

export interface PlainCliLoopExecutionState {
  activeTurnAbortController: AbortController | null;
  turnCancellationPending: boolean;
}

export interface PlainCliLoopOptions {
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

export interface PlainCliLoopResult {
  shouldExit: boolean;
}

export type PlainPromptLifecycleState = PlainCliLoopExecutionState & {
  closed: boolean;
};

export interface PlainPromptLoopOptions {
  rl: Interface;
  output: NodeJS.WriteStream;
  context: AppContext;
  state: CliState;
  interactiveShell: boolean;
  lifecycleState: PlainPromptLifecycleState;
  resetLastRenderedRunEventKey: () => void;
}
