import { restoreTerminalState } from "@/cli/render-utils";
import type { AppContext } from "@/runtime/bootstrap";
import type { TuiLifecycleScreen, TuiLifecycleState } from "./types";

interface TuiExitHandlerDependencies {
  context: AppContext;
  screen: TuiLifecycleScreen;
  output: NodeJS.WriteStream;
  lifecycleState: TuiLifecycleState;
}

export interface TuiExitHandler {
  exitCli(exitCode?: number): void;
  forceTerminateCli(signal: string): void;
  scheduleForcedTuiExit(signal: string): void;
  clearForceExitTimer(): void;
}

export function createTuiExitHandler(
  dependencies: TuiExitHandlerDependencies,
): TuiExitHandler {
  const { context, screen, output, lifecycleState } = dependencies;

  const clearForceExitTimer = () => {
    if (lifecycleState.forceExitTimer) {
      clearTimeout(lifecycleState.forceExitTimer);
      lifecycleState.forceExitTimer = null;
    }
  };

  const beginExit = (exitCode: number): boolean => {
    if (lifecycleState.shuttingDown) {
      return false;
    }
    lifecycleState.shuttingDown = true;
    lifecycleState.requestedExitCode = exitCode;
    clearForceExitTimer();
    if (!lifecycleState.screenDestroyed) {
      screen.destroy();
    }
    restoreTerminalState(output);
    return true;
  };

  const hardExit = (exitCode: number) => {
    restoreTerminalState(output);
    process.exit(exitCode);
  };

  const exitCli = (exitCode = 0) => {
    beginExit(exitCode);
  };

  const forceTerminateCli = (signal: string) => {
    const exitCode = signal === "SIGINT" ? 130 : 0;
    if (lifecycleState.shuttingDown) {
      hardExit(exitCode);
      return;
    }
    beginExit(exitCode);
    output.write(
      `\n${context.config.agentName} received ${signal}. Exiting.\n`,
    );
    hardExit(exitCode);
  };

  const scheduleForcedTuiExit = (signal: string) => {
    if (lifecycleState.forceExitTimer) {
      return;
    }
    lifecycleState.forceExitTimer = setTimeout(() => {
      forceTerminateCli(signal);
    }, 750);
    lifecycleState.forceExitTimer.unref?.();
  };

  return {
    exitCli,
    forceTerminateCli,
    scheduleForcedTuiExit,
    clearForceExitTimer,
  };
}
