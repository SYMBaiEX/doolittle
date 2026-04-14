import type { RunDepth, ToolProgressMode } from "@/types/runtime";
import { classifyTurnMessage } from "./message";
import type { TurnExecutionPolicy } from "./types";

export function deriveTurnExecutionPolicy(
  message: string,
  base: {
    runDepth: RunDepth;
    maxIterations: number;
    toolProgressMode: ToolProgressMode;
  },
  options?: {
    localInteractive?: boolean;
  },
): TurnExecutionPolicy {
  const turn = classifyTurnMessage(message);
  const localInteractive = options?.localInteractive ?? false;

  if (turn.simpleChat) {
    return {
      runDepth: "quick",
      maxIterations: 1,
      toolProgressMode:
        base.toolProgressMode === "verbose" ? "new" : base.toolProgressMode,
      useMultiStep: false,
    };
  }

  if (turn.likelyLocalTask && localInteractive) {
    return {
      runDepth: base.runDepth === "explore" ? "deep" : base.runDepth,
      maxIterations: Math.max(2, Math.min(base.maxIterations, 4)),
      toolProgressMode: base.toolProgressMode,
      useMultiStep: turn.actionOriented,
    };
  }

  if (!turn.requiresFullContext && localInteractive) {
    return {
      runDepth: base.runDepth === "explore" ? "deep" : base.runDepth,
      maxIterations: Math.max(1, Math.min(base.maxIterations, 4)),
      toolProgressMode:
        base.toolProgressMode === "verbose" ? "all" : base.toolProgressMode,
      useMultiStep: turn.shouldUseMultiStep,
    };
  }

  if (turn.requiresFullContext && localInteractive) {
    if (!turn.actionOriented) {
      return {
        runDepth: base.runDepth,
        maxIterations: 1,
        toolProgressMode:
          base.toolProgressMode === "verbose" ? "all" : base.toolProgressMode,
        useMultiStep: false,
      };
    }
    const interactiveCap =
      base.runDepth === "quick"
        ? 4
        : base.runDepth === "standard"
          ? 8
          : base.runDepth === "deep"
            ? 12
            : 18;
    return {
      runDepth: base.runDepth,
      maxIterations: Math.max(3, Math.min(base.maxIterations, interactiveCap)),
      toolProgressMode:
        base.toolProgressMode === "verbose" ? "all" : base.toolProgressMode,
      useMultiStep: turn.shouldUseMultiStep,
    };
  }

  return {
    runDepth: base.runDepth,
    maxIterations: base.maxIterations,
    toolProgressMode: base.toolProgressMode,
    useMultiStep: turn.shouldUseMultiStep,
  };
}
