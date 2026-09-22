import { parseJSONObjectFromText } from "@elizaos/core";

const TERMINAL_ACTIONS = new Set(["REPLY", "IGNORE", "STOP", "NONE"]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPendingTool(value: unknown): boolean {
  if (!record(value)) return false;
  const nativeFunction = record(value.function) ? value.function : {};
  const name = value.name ?? value.action ?? nativeFunction.name;
  if (typeof name !== "string" || !name.trim()) return false;
  const normalized = name
    .trim()
    .replace(/^(?:functions?|tools?)\./iu, "")
    .toUpperCase();
  return !TERMINAL_ACTIONS.has(normalized);
}

/**
 * beta.7's planner skips evaluation after a successful tool when its earlier
 * plan supplied messageToUser and omitted completed (or set it true). A plan
 * cannot verify a tool result that does not exist yet. Request the official
 * post-tool evaluator using completed:false, leaving termination to that
 * evaluation or a later terminal REPLY. No user-facing prose is inspected.
 *
 * Native GenerateTextResult objects already bypass that shortcut: beta.7's
 * parser does not copy their messageToUser/completed into planner.raw. Return
 * them unchanged, retaining native tool calls, usage, and provider metadata.
 */
export function requirePostToolAssessment<T>(output: T): T {
  if (typeof output !== "string") return output;
  const parsed = parseJSONObjectFromText(output);
  if (!parsed || parsed.completed === false) return output;
  const calls = Array.isArray(parsed.toolCalls)
    ? parsed.toolCalls
    : parsed.toolCalls
      ? [parsed.toolCalls]
      : [parsed];
  if (!calls.some(isPendingTool)) return output;
  return JSON.stringify({ ...parsed, completed: false }) as T;
}
