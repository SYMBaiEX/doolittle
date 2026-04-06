import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import blessed from "blessed";
import { installBlessedTextboxGuard } from "@/cli/blessed-guards";
import {
  type CliState,
  createCliSessionId,
  resolveStaticCliInput,
  runCliPrompt,
  runCliPromptWithEvents,
} from "@/cli/execution";
import {
  installPlainCliLifecycle,
  type PlainCliLifecycleState,
} from "@/cli/plain-lifecycle";
import { runPlainPromptLoop } from "@/cli/plain-loop";
import { subscribePlainRunUpdates } from "@/cli/plain-run-updates";
import {
  renderPlainStartup,
  schedulePlainDeferredHydration,
} from "@/cli/plain-startup";
import { type StartCliOptions, startTui } from "@/cli/tui-start";
import type { AppContext } from "@/runtime/bootstrap";

installBlessedTextboxGuard(
  blessed as unknown as Parameters<typeof installBlessedTextboxGuard>[0],
);

export type {
  CliPromptEventHandlers,
  CliPromptRunOptions,
} from "@/cli/execution";
export { renderFooter } from "@/cli/tui-renderers";
export { resolveStaticCliInput, runCliPrompt, runCliPromptWithEvents };

async function startPlainCli(
  context: AppContext,
  options?: StartCliOptions,
): Promise<void> {
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
    process.exit(plainLifecycleState.requestedExitCode);
  }
}

export async function startCli(
  context: AppContext,
  options?: StartCliOptions,
): Promise<void> {
  const cliLogger = context.services.logger.child("cli");
  const forcePlain = Bun.argv.includes("--plain-cli");
  const forceCockpit =
    Bun.argv.includes("--cockpit") || Bun.argv.includes("--cli");
  const canUseTui = input.isTTY && output.isTTY && forceCockpit && !forcePlain;

  if (!canUseTui) {
    await startPlainCli(context, options);
    return;
  }

  try {
    const tuiResult = await startTui(context, options);
    if (tuiResult === "too-small") {
      await startPlainCli(context, options);
      return;
    }
    if (tuiResult === "unexpected") {
      cliLogger.warn("tui closed unexpectedly; falling back to plain cli");
      console.warn(
        `${context.config.agentName} TUI closed unexpectedly. Falling back to plain CLI.`,
      );
      await startPlainCli(context, options);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    cliLogger.warn("tui startup failed; falling back to plain cli", {
      detail,
    });
    console.warn(
      `${context.config.agentName} TUI failed to start (${detail}). Falling back to plain CLI.`,
    );
    await startPlainCli(context, options);
  }
}
