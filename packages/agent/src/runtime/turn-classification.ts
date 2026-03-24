import type { RunDepth, ToolProgressMode } from "@/types";

const LOCAL_TASK_FAST_PATH_PATTERN =
  /\b(search|find|read|open|inspect|show|grep|rg|git|status|diff|log|repo|repository|workspace|directory|file|files|command|run|execute|terminal|shell|ls|list)\b/i;

const FULL_CONTEXT_PATTERN =
  /\b(delegat(?:e|ion|ed|ing)?|worker|queue|cron|schedule|gateway|transport|plugin|plugins|skills?|memory|profile|profiles|belief|relationship|operator|doctor|diagnostic|status|settings|accounts?|provider|providers?)\b/i;

const COMPLEX_KEYWORDS = new Set([
  "debug",
  "debugging",
  "implement",
  "implementation",
  "refactor",
  "patch",
  "traceback",
  "stacktrace",
  "exception",
  "error",
  "analyze",
  "analysis",
  "investigate",
  "architecture",
  "design",
  "compare",
  "benchmark",
  "optimize",
  "optimise",
  "review",
  "terminal",
  "shell",
  "tool",
  "tools",
  "pytest",
  "test",
  "tests",
  "plan",
  "planning",
  "delegate",
  "subagent",
  "cron",
  "docker",
  "kubernetes",
  "repository",
  "workspace",
  "diff",
  "grep",
  "file",
  "files",
  "code",
  "coding",
]);

const URL_RE = /https?:\/\/|www\./i;
const SIMPLE_TURN_MAX_CHARS = 160;
const SIMPLE_TURN_MAX_WORDS = 28;

export interface TurnClassification {
  simpleChat: boolean;
  likelyLocalTask: boolean;
  requiresFullContext: boolean;
  shouldUseMultiStep: boolean;
}

export type AgentContextScope = "minimal" | "local" | "full";

export interface TurnExecutionPolicy {
  runDepth: RunDepth;
  maxIterations: number;
  toolProgressMode: ToolProgressMode;
  useMultiStep: boolean;
}

export function isSimpleGreetingMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return /^(hi|hey|hello|yo|sup|what'?s up|howdy|hiya)[!.?]*$/iu.test(
    normalized,
  );
}

export function classifyTurnMessage(message: string): TurnClassification {
  const text = message.trim();
  const lowered = text.toLowerCase();

  if (!text || text.startsWith("/") || text.startsWith("!")) {
    return {
      simpleChat: false,
      likelyLocalTask: false,
      requiresFullContext: false,
      shouldUseMultiStep: false,
    };
  }

  const likelyLocalTask = LOCAL_TASK_FAST_PATH_PATTERN.test(text);
  const requiresFullContext = FULL_CONTEXT_PATTERN.test(text);

  if (isSimpleGreetingMessage(text)) {
    return {
      simpleChat: true,
      likelyLocalTask: false,
      requiresFullContext: false,
      shouldUseMultiStep: false,
    };
  }

  const words = lowered
    .split(/\s+/u)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);

  const hasComplexKeyword = words.some((word) => COMPLEX_KEYWORDS.has(word));
  const looksSimple =
    text.length <= SIMPLE_TURN_MAX_CHARS &&
    words.length <= SIMPLE_TURN_MAX_WORDS &&
    text.split("\n").length <= 2 &&
    !text.includes("```") &&
    !text.includes("`") &&
    !URL_RE.test(text) &&
    !hasComplexKeyword &&
    !likelyLocalTask &&
    !requiresFullContext;

  return {
    simpleChat: looksSimple,
    likelyLocalTask,
    requiresFullContext,
    shouldUseMultiStep: !looksSimple,
  };
}

export function resolveAgentContextScope(message: string): AgentContextScope {
  const turn = classifyTurnMessage(message);
  if (turn.requiresFullContext) {
    return "full";
  }
  if (turn.likelyLocalTask) {
    return "local";
  }
  return "minimal";
}

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
      maxIterations: Math.max(2, Math.min(base.maxIterations, 8)),
      toolProgressMode: base.toolProgressMode,
      useMultiStep: true,
    };
  }

  if (!turn.requiresFullContext && localInteractive) {
    return {
      runDepth: base.runDepth === "explore" ? "deep" : base.runDepth,
      maxIterations: Math.max(2, Math.min(base.maxIterations, 6)),
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
