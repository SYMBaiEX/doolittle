const LOCAL_EXECUTION_HINT_PATTERN =
  /\b(search|find|read|open|inspect|show|grep|rg|git|status|diff|log|repo|repository|workspace|directory|file|files|command|run|execute|terminal|shell|ls|list)\b/i;

export function mayNeedDirectLocalIntentInspection(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("/") || trimmed.startsWith("!")) {
    return false;
  }
  return LOCAL_EXECUTION_HINT_PATTERN.test(trimmed);
}

export function looksLikeDeferredActionPromise(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    "i'll ",
    "i will ",
    "let me ",
    "i'm going to ",
    "i am going to ",
    "one moment",
    "give me a moment",
    "searching ",
    "checking ",
    "looking ",
    "running ",
    "inspecting ",
    "reading ",
    "opening ",
  ].some((prefix) => normalized.startsWith(prefix));
}

export function looksLikeNativeExecutionFailure(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    "parse error",
    "didn't complete successfully",
    "did not complete successfully",
    "couldn't complete successfully",
    "could not complete successfully",
    "action didn't complete",
    "action did not complete",
    "failed to complete",
    "hit a parse error",
    "encountered a parse error",
    "tool call failed",
    "execution failed",
  ].some((fragment) => normalized.includes(fragment));
}

export function looksLikeIncompleteLocalReview(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    (normalized.includes("what was completed:") &&
      normalized.includes("what was not completed:")) ||
    normalized.includes("if you want, i can now do the actual repo review") ||
    normalized.includes("i searched the local workspace") ||
    normalized.includes("deeper repo inspection did not finish") ||
    normalized.includes("no verified breakdown") ||
    normalized.includes("execution trace ended in a parse_error")
  );
}
