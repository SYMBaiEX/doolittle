import type { ActionResult } from "@elizaos/core";
import type { AgentExecutionContext } from "@/runtime/chat";
import { runModelAnalysis } from "@/runtime/model-analysis";
import type { AutomationRuntimeOverrides } from "@/types/runtime";
import { escapeXml } from "@/utils/eliza-compat";

const MAX_RESULT_CHARS = 6_000;
const MAX_EVIDENCE_CHARS = 16_000;
const LARGE_TOOL_TRANSCRIPT_CHARS = 2_000;
const LARGE_TOOL_TRANSCRIPT_LINES = 20;

const RAW_FILE_READ =
  /^Read:\s+.+\nLines:\s+\d+-\d+\s+of\s+\d+\n(?:\d+\|[^\n]*(?:\n|$)){2,}/u;
const RAW_FILE_SEARCH = /^(?:Content|File) matches for "[^"]+" in .+:\n[^\n]+/u;

function resultText(result: ActionResult): string {
  if (typeof result.text === "string" && result.text.trim()) {
    return result.text.trim();
  }
  return typeof result.userFacingText === "string"
    ? result.userFacingText.trim()
    : "";
}

function isRawToolTranscript(value: string): boolean {
  if (RAW_FILE_READ.test(value) || RAW_FILE_SEARCH.test(value)) return true;
  if (value.length < LARGE_TOOL_TRANSCRIPT_CHARS) return false;
  return value.split("\n").length >= LARGE_TOOL_TRANSCRIPT_LINES;
}

/**
 * Detects an SDK terminal response that is actually an unsynthesized native
 * action receipt. Exact matching keeps normal answers containing short tool
 * excerpts valid while known/raw high-volume transcripts are rejected.
 */
export function isUnsynthesizedToolResponse(
  response: string,
  actionResults: readonly ActionResult[],
): boolean {
  const normalized = response.trim();
  if (!normalized || actionResults.length === 0) return false;

  const matchingResult = actionResults.find((result) => {
    const text = resultText(result);
    return text.length > 0 && text === normalized;
  });
  if (!matchingResult) return false;

  return (
    matchingResult.verifiedUserFacing !== true ||
    isRawToolTranscript(normalized)
  );
}

function clipResult(value: string): string {
  if (value.length <= MAX_RESULT_CHARS) return value;
  const marker = "\n\n[tool output clipped for synthesis]\n\n";
  const available = MAX_RESULT_CHARS - marker.length;
  const head = Math.ceil(available / 2);
  const tail = Math.floor(available / 2);
  return `${value.slice(0, head)}${marker}${value.slice(-tail)}`;
}

function buildEvidence(actionResults: readonly ActionResult[]): string {
  let remaining = MAX_EVIDENCE_CHARS;
  const evidence: string[] = [];

  for (const [index, result] of actionResults.entries()) {
    const text = clipResult(resultText(result));
    if (!text || remaining <= 0) continue;
    const status = result.success === false ? "failed" : "succeeded";
    const prefix = `<tool_result index="${index + 1}" status="${status}">\n`;
    const suffix = "\n</tool_result>";
    const bodyCapacity = remaining - prefix.length - suffix.length;
    if (bodyCapacity <= 0) break;
    const body = escapeXml(text).slice(0, bodyCapacity);
    const entry = `${prefix}${body}${suffix}`;
    evidence.push(entry);
    remaining -= entry.length;
  }

  return evidence.join("\n\n");
}

export function buildToolResultSynthesisPrompt(input: {
  userRequest: string;
  actionResults: readonly ActionResult[];
}): string {
  return [
    "Complete the assistant turn using the native tool evidence below.",
    "Answer the user's request directly and accurately.",
    "Do not repeat raw tool transcripts, line-number dumps, or tool protocol text.",
    "Summarize the relevant evidence and state any important uncertainty.",
    "Return only the final user-facing answer.",
    "",
    `<user_request>${escapeXml(input.userRequest.trim())}</user_request>`,
    "",
    "<tool_evidence>",
    buildEvidence(input.actionResults),
    "</tool_evidence>",
  ].join("\n");
}

export async function synthesizeToolResultResponse(input: {
  context: AgentExecutionContext;
  userRequest: string;
  actionResults: readonly ActionResult[];
  abortSignal?: AbortSignal;
  runtimeOverrides?: AutomationRuntimeOverrides;
}): Promise<string> {
  const response = await runModelAnalysis(
    input.context,
    buildToolResultSynthesisPrompt(input),
    {
      label: "native-tool-result-synthesis",
      abortSignal: input.abortSignal,
      runtimeOverrides: input.runtimeOverrides,
    },
  );
  const normalized = response.trim();
  if (
    !normalized ||
    isUnsynthesizedToolResponse(normalized, input.actionResults)
  ) {
    throw new Error(
      "ElizaOS returned native tool output without a terminal synthesis.",
    );
  }
  return normalized;
}
