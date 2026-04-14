import type { TuiLifecycleState } from "./types";

interface TuiSignalHandlerDependencies {
  lifecycleState: TuiLifecycleState;
  requestActiveTurnCancellation: (
    shouldExitAfterCancellation?: boolean,
  ) => boolean;
  scheduleForcedTuiExit: (signal: string) => void;
  forceTerminateCli: (signal: string) => void;
}

export interface TuiSignalHandlers {
  handleSigint(): void;
  handleSigterm(): void;
}

export function createTuiSignalHandlers(
  dependencies: TuiSignalHandlerDependencies,
): TuiSignalHandlers {
  const {
    lifecycleState,
    requestActiveTurnCancellation,
    scheduleForcedTuiExit,
    forceTerminateCli,
  } = dependencies;

  const shouldIgnoreDuplicateInterrupt = () => {
    const now = Date.now();
    if (now - lifecycleState.lastInterruptAt < 150) {
      return true;
    }
    lifecycleState.lastInterruptAt = now;
    return false;
  };

  const handleSigint = () => {
    if (shouldIgnoreDuplicateInterrupt()) {
      return;
    }
    lifecycleState.requestedExitCode = 130;
    if (requestActiveTurnCancellation(true)) {
      scheduleForcedTuiExit("SIGINT");
      return;
    }
    forceTerminateCli("SIGINT");
  };

  const handleSigterm = () => {
    forceTerminateCli("SIGTERM");
  };

  return {
    handleSigint,
    handleSigterm,
  };
}
