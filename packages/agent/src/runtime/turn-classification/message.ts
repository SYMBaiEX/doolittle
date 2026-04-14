import type {
  AgentContextScope,
  TurnCapabilityProfile,
  TurnClassification,
} from "./types";

const LOCAL_TASK_FAST_PATH_PATTERN =
  /\b(search|find|read|open|inspect|show|grep|rg|git|status|diff|log|repo|repository|workspace|directory|folder|path|file|files|command|run|execute|terminal|shell|ls|list)\b/i;

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
const ACTION_REQUEST_PATTERN =
  /^(?:please\s+)?(?:fix|implement|refactor|patch|update|change|edit|write|create|delete|remove|search|find|read|open|inspect|show|run|execute|review|debug|investigate|compare|benchmark|optimize|list|scan|check|look at|look for)\b/i;
const INFORMATIONAL_REQUEST_PATTERN =
  /^(?:what|why|how|when|where|who|is|are|can|could|would|should|do|does|did|tell me|explain|describe|summari[sz]e|overview)\b/i;

function extractWords(text: string): string[] {
  return text
    .split(/\s+/u)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

export function isSimpleGreetingMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return /^(hi|hey|hello|yo|sup|what'?s up|howdy|hiya)(?:\s+(?:there|eliza|agent|buddy|friend))?[!.?]*$/iu.test(
    normalized,
  );
}

export function isSimpleSocialMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (isSimpleGreetingMessage(normalized)) {
    return true;
  }
  return /^(how are you(?: doing)?(?: today)?|how'?s it going|how are things|thanks|thank you)[!.?]*$/iu.test(
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
      actionOriented: false,
      informationalOnly: false,
      shouldUseMultiStep: false,
    };
  }

  const likelyLocalTask = LOCAL_TASK_FAST_PATH_PATTERN.test(text);
  const requiresFullContext = FULL_CONTEXT_PATTERN.test(text);

  if (isSimpleSocialMessage(text)) {
    return {
      simpleChat: true,
      likelyLocalTask: false,
      requiresFullContext: false,
      actionOriented: false,
      informationalOnly: true,
      shouldUseMultiStep: false,
    };
  }

  const words = extractWords(lowered);
  const hasComplexKeyword = words.some((word) => COMPLEX_KEYWORDS.has(word));
  const actionOriented =
    ACTION_REQUEST_PATTERN.test(text) ||
    likelyLocalTask ||
    (hasComplexKeyword &&
      /(?:fix|implement|refactor|patch|update|change|edit|write|create|delete|remove|run|execute|review|debug|investigate|compare|benchmark|optimize|search|find|read|open|inspect|show|list|scan|check)/i.test(
        text,
      ));
  const informationalOnly =
    !actionOriented &&
    (INFORMATIONAL_REQUEST_PATTERN.test(text) ||
      /\?\s*$/u.test(text) ||
      (!likelyLocalTask && !requiresFullContext && !hasComplexKeyword));
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
    actionOriented,
    informationalOnly,
    shouldUseMultiStep:
      !looksSimple &&
      (actionOriented ||
        (requiresFullContext && !informationalOnly && hasComplexKeyword)),
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

export function resolveTurnCapabilityProfile(
  message: string,
  options?: { localInteractive?: boolean },
): TurnCapabilityProfile {
  const turn = classifyTurnMessage(message);
  if (turn.requiresFullContext) {
    return "full";
  }
  if (
    turn.likelyLocalTask ||
    (options?.localInteractive &&
      turn.actionOriented &&
      !turn.informationalOnly)
  ) {
    return "coding";
  }
  if (turn.informationalOnly) {
    return "minimal";
  }
  return "messaging";
}
