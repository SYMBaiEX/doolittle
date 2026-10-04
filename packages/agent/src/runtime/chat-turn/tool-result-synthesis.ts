import type { ActionResult } from "@elizaos/core";
import { extractCommandResultFromActionResult } from "@/runtime/action-result-metadata";
import type { AgentExecutionContext } from "@/runtime/chat";
import { runModelAnalysis } from "@/runtime/model-analysis";
import type { AutomationRuntimeOverrides } from "@/types/runtime";
import { escapeXml } from "@/utils/eliza-compat";
import { resolveExactOutputIntent } from "./exact-output-intent";

const MAX_RESULT_CHARS = 6_000;
const MAX_EVIDENCE_CHARS = 16_000;
const LARGE_TOOL_TRANSCRIPT_CHARS = 2_000;
const LARGE_TOOL_TRANSCRIPT_LINES = 20;
const MAX_EXACT_OUTPUT_CHARS = 4_000;
const MAX_EXACT_OUTPUT_LINES = 16;
const SHELL_ACTIONS = new Set(["SHELL", "SHELL_COMMAND", "RUN_IN_TERMINAL"]);

const RAW_FILE_READ =
  /^Read:\s+.+\nLines:\s+\d+-\d+\s+of\s+\d+\n(?:\d+\|[^\n]*(?:\n|$)){2,}/u;
const RAW_FILE_SEARCH = /^(?:Content|File) matches for "[^"]+" in .+:\n[^\n]+/u;

function resultTexts(result: ActionResult): string[] {
  return [result.text, result.userFacingText].flatMap((value) =>
    typeof value === "string" && value.trim() ? [value.trim()] : [],
  );
}

function resultText(result: ActionResult): string {
  return resultTexts(result)[0] ?? "";
}

function isRawToolTranscript(value: string): boolean {
  if (RAW_FILE_READ.test(value) || RAW_FILE_SEARCH.test(value)) return true;
  if (value.length < LARGE_TOOL_TRANSCRIPT_CHARS) return false;
  return value.split("\n").length >= LARGE_TOOL_TRANSCRIPT_LINES;
}

function dataRecord(result: ActionResult): Record<string, unknown> | undefined {
  return result.data &&
    typeof result.data === "object" &&
    !Array.isArray(result.data)
    ? result.data
    : undefined;
}

/** Validate an already selected SDK answer; never construct one from stdout. */
function exactOutputResult(
  response: string,
  actionResults: readonly ActionResult[],
  userRequest: string,
): ActionResult | undefined {
  const intent = resolveExactOutputIntent(userRequest);
  if (
    !intent ||
    response !== response.trim() ||
    response.length > MAX_EXACT_OUTPUT_CHARS ||
    response.split("\n").length > MAX_EXACT_OUTPUT_LINES ||
    isRawToolTranscript(response)
  )
    return undefined;
  if (intent !== "verbatim") {
    try {
      const value: unknown = JSON.parse(response);
      if (!value || typeof value !== "object") return undefined;
      if (intent === "json-object" && Array.isArray(value)) return undefined;
    } catch {
      return undefined;
    }
  }
  // A malformed duplicate or another receipt with the same output is ambiguous,
  // even if only one of them claims verified delivery.
  const matches = actionResults.filter((result) => {
    const stdout = dataRecord(result)?.stdout;
    return (
      resultTexts(result).includes(response) ||
      (typeof stdout === "string" && stdout.trim() === response)
    );
  });
  if (matches.length !== 1) return undefined;
  const result = matches[0];
  const data = dataRecord(result);
  if (
    !data ||
    result.success !== true ||
    result.verifiedUserFacing !== true ||
    result.userFacingText !== response ||
    result.error != null ||
    typeof data.actionName !== "string" ||
    !SHELL_ACTIONS.has(data.actionName) ||
    typeof data.command !== "string" ||
    !data.command.trim() ||
    data.exitCode !== 0 ||
    data.timedOut !== false ||
    data.truncated !== false ||
    data.stderr !== "" ||
    typeof data.stdout !== "string" ||
    data.stdout.trim() !== response ||
    "commandResult" in data ||
    ("success" in data && data.success !== true) ||
    ("verifiedUserFacing" in data && data.verifiedUserFacing !== true) ||
    ("userFacingText" in data && data.userFacingText !== response) ||
    ("error" in data && data.error != null) ||
    resultTexts(result).some(isRawToolTranscript) ||
    actionResults.some((other) => {
      const otherData = dataRecord(other);
      const nested = otherData?.commandResult;
      return (
        other !== result &&
        (otherData?.command === data.command ||
          (nested &&
            typeof nested === "object" &&
            "command" in nested &&
            nested.command === data.command))
      );
    })
  )
    return undefined;
  return result;
}

/**
 * Detects an SDK terminal response that is actually an unsynthesized native
 * action receipt. Exact matching keeps normal answers containing short tool
 * excerpts valid while known/raw high-volume transcripts are rejected.
 */
export function isUnsynthesizedToolResponse(
  response: string,
  actionResults: readonly ActionResult[],
  userRequest = "",
  allowExactOutput = true,
): boolean {
  const normalized = response.trim();
  if (!normalized || actionResults.length === 0) return false;
  const exactResult = allowExactOutput
    ? exactOutputResult(response, actionResults, userRequest)
    : undefined;

  return actionResults.some((result) => {
    const data = dataRecord(result);
    const commandReceipt = Boolean(
      extractCommandResultFromActionResult(result) ||
        (data &&
          ("commandResult" in data ||
            "command" in data ||
            (typeof data.actionName === "string" &&
              SHELL_ACTIONS.has(data.actionName)))),
    );
    const unqualifiedCommand =
      commandReceipt &&
      !userRequest.trimStart().startsWith("!") &&
      result !== exactResult;
    // SDK diagnostic wrapper text can differ from stdout. A bare stdout echo is
    // still a raw receipt unless the same canonical delivery proof qualifies it.
    if (
      unqualifiedCommand &&
      typeof data?.stdout === "string" &&
      data.stdout.trim() === normalized
    )
      return true;
    return resultTexts(result).some((text) => {
      if (text === normalized) {
        if (unqualifiedCommand) return true;
        return result.verifiedUserFacing !== true || isRawToolTranscript(text);
      }
      return isRawToolTranscript(text) && normalized.includes(text);
    });
  });
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
    "A failed tool result is not completion unless later evidence clearly proves the requested operation succeeded.",
    "Never claim a requested file, directory, or code change exists without successful evidence for that change.",
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
  allowExactOutput?: boolean;
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
    isUnsynthesizedToolResponse(
      normalized,
      input.actionResults,
      input.userRequest,
      input.allowExactOutput,
    )
  ) {
    throw new Error(
      "ElizaOS returned native tool output without a terminal synthesis.",
    );
  }
  return normalized;
}
