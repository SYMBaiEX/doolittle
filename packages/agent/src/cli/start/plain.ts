import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { type CliState, createCliSessionId } from "@/cli/execution";
import {
  installPlainCliLifecycle,
  type PlainCliLifecycleState,
} from "@/cli/plain-lifecycle";
import { runPlainPromptLoop } from "@/cli/plain-loop/prompt-loop";
import { subscribePlainRunUpdates } from "@/cli/plain-run-updates";
import {
  renderPlainStartup,
  schedulePlainDeferredHydration,
} from "@/cli/plain-startup";
import type { StartCliOptions } from "@/cli/tui-start";
import type { AppContext } from "@/runtime/bootstrap";

export async function startPlainCli(
  context: AppContext,
  options?: StartCliOptions,
): Promise<number> {
  const plainLogger = context.services.logger.child("cli.plain");
  const rl = createInterface({ input, output });
  const interactiveShell = input.isTTY && output.isTTY;
  const state: CliState = {
    activeSessionId: createCliSessionId("cli"),
    notices: [],
  };
  const plainLifecycleState: PlainCliLifecycleState = {
    closed: false,
    requestedExitCode: 0,
    activeTurnAbortController: null,
    turnCancellationPending: false,
    forceExitTimer: null,
    cleanedUp: false,
    lastInterruptAt: 0,
  };
  let lastRenderedRunEventKey = "";
  const unsubscribeRunUpdates = subscribePlainRunUpdates({
    context,
    sessionId: state.activeSessionId,
    interactiveShell,
    output,
    getLastRenderedKey: () => lastRenderedRunEventKey,
    setLastRenderedKey: (value) => {
      lastRenderedRunEventKey = value;
    },
  });
  const plainLifecycle = installPlainCliLifecycle(plainLifecycleState, {
    rl,
    output,
    interactiveShell,
    logger: plainLogger.child("lifecycle"),
    unsubscribeRunUpdates,
  });

  rl.on("close", () => {
    plainLifecycleState.closed = true;
  });

  renderPlainStartup({
    context,
    state,
    output,
    interactiveShell,
    bootLogs: options?.bootLogs,
    onReady: options?.onReady,
  });
  schedulePlainDeferredHydration({
    context,
    output,
    logger: plainLogger.child("startup"),
    shouldRun: input.isTTY && output.isTTY,
    handleRecoverableRuntimeError: plainLifecycle.handleRecoverableRuntimeError,
  });
  try {
    await runPlainPromptLoop({
      rl,
      output,
      context,
      state,
      interactiveShell,
      lifecycleState: plainLifecycleState,
      resetLastRenderedRunEventKey: () => {
        lastRenderedRunEventKey = "";
      },
    });
  } finally {
    plainLifecycle.cleanup();
  }

  return plainLifecycleState.requestedExitCode;
}
