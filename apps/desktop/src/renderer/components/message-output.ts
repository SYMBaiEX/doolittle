import { asRecordOrUndefined } from "@elizaos/shared/type-guards";

export type ToolActivityStatus = "pending" | "running" | "completed" | "error";

export interface ToolActivity {
  id: string;
  name: string;
  status: ToolActivityStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export interface AgentStepSummary {
  continued: number;
  finished: number;
  failed: number;
}

export interface ParsedAgentMessage {
  text: string;
  tools: ToolActivity[];
  steps: AgentStepSummary;
}

export interface WebSearchResult {
  title: string;
  url: string;
  excerpt?: string;
  publishDate?: string;
}

type EmbeddedAgentEventType = "tool_call" | "tool_result" | "evaluation";

interface EmbeddedAgentEvent {
  type: EmbeddedAgentEventType;
  [key: string]: unknown;
}

interface JsonRange {
  end: number;
  value: unknown;
}

const EVENT_START =
  /\{\s*"type"\s*:\s*"(?:tool_call|tool_result|evaluation)"/gu;

function parseLegacyReadResult(content: string): ToolActivity | undefined {
  const header = /^Read:\s+([^\n]+)\nLines:\s+(\d+)-(\d+)\s+of\s+(\d+)\n/u.exec(
    content,
  );
  if (!header) return undefined;
  const body = content.slice(header[0].length).split("\n");
  if (
    body.length < 2 ||
    body.some((line) => line.length > 0 && !/^\d+\|/u.test(line))
  ) {
    return undefined;
  }

  return {
    id: "legacy-read-file-result",
    name: "READ_FILE",
    status: "completed",
    input: {
      path: header[1],
      offset: Number(header[2]),
      end: Number(header[3]),
      total: Number(header[4]),
    },
    output: content,
  };
}

function parseLegacySearchResult(content: string): ToolActivity | undefined {
  const header = /^(Content|File) matches for "([^"]+)" in ([^\n]+):\n/u.exec(
    content,
  );
  if (!header) return undefined;
  const body = content.slice(header[0].length).trim();
  if (!body) return undefined;

  return {
    id: "legacy-search-files-result",
    name: "SEARCH_FILES",
    status: "completed",
    input: {
      pattern: header[2],
      root: header[3],
      target: header[1] === "File" ? "files" : "content",
    },
    output: content,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readJsonObject(source: string, start: number): JsonRange | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character !== "}") continue;

    depth -= 1;
    if (depth !== 0) continue;
    const end = index + 1;
    try {
      return { end, value: JSON.parse(source.slice(start, end)) };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isInsideCodeFence(source: string, offset: number): boolean {
  const before = source.slice(0, offset);
  return (before.match(/```/gu)?.length ?? 0) % 2 === 1;
}

function isEmbeddedAgentEvent(value: unknown): value is EmbeddedAgentEvent {
  const event = asRecordOrUndefined(value);
  if (!event) return false;
  if (event.type === "tool_call") {
    const toolCall = asRecordOrUndefined(event.toolCall);
    return Boolean(
      toolCall &&
        stringValue(toolCall.id) &&
        stringValue(toolCall.name) &&
        stringValue(event.messageId),
    );
  }
  if (event.type === "tool_result") {
    const toolCall = asRecordOrUndefined(event.toolCall);
    return Boolean(
      stringValue(event.toolCallId) ||
        (toolCall && stringValue(toolCall.id) && stringValue(toolCall.name)),
    );
  }
  return (
    event.type === "evaluation" &&
    Boolean(asRecordOrUndefined(event.evaluation))
  );
}

function statusFromToolCall(value: unknown): ToolActivityStatus {
  const normalized = String(value ?? "").toLowerCase();
  if (["completed", "complete", "success", "succeeded"].includes(normalized)) {
    return "completed";
  }
  if (["error", "failed", "failure", "denied"].includes(normalized)) {
    return "error";
  }
  if (["running", "started", "in_progress"].includes(normalized)) {
    return "running";
  }
  return "pending";
}

function errorFromResult(value: unknown): string | undefined {
  const result = asRecordOrUndefined(value);
  if (!result) return undefined;
  if (result.success === false) {
    return (
      stringValue(result.error) ??
      stringValue(result.message) ??
      "Tool execution failed."
    );
  }
  return stringValue(result.error);
}

function normalizeVisibleText(value: string): string {
  return value
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function addToolCall(
  event: EmbeddedAgentEvent,
  tools: ToolActivity[],
  toolIndex: Map<string, number>,
): void {
  const toolCall = asRecordOrUndefined(event.toolCall);
  if (!toolCall) return;
  const id = stringValue(toolCall.id);
  const name = stringValue(toolCall.name);
  if (!id || !name) return;

  const activity: ToolActivity = {
    id,
    name,
    status: statusFromToolCall(toolCall.status),
    ...(toolCall.arguments !== undefined ? { input: toolCall.arguments } : {}),
  };
  const existingIndex = toolIndex.get(id);
  if (existingIndex === undefined) {
    toolIndex.set(id, tools.length);
    tools.push(activity);
  } else {
    tools[existingIndex] = { ...tools[existingIndex], ...activity };
  }
}

function addToolResult(
  event: EmbeddedAgentEvent,
  tools: ToolActivity[],
  toolIndex: Map<string, number>,
): void {
  const toolCall = asRecordOrUndefined(event.toolCall);
  const id =
    stringValue(event.toolCallId) ??
    (toolCall ? stringValue(toolCall.id) : undefined);
  if (!id) return;
  const name =
    (toolCall ? stringValue(toolCall.name) : undefined) ?? "Agent tool";
  const output =
    event.result !== undefined
      ? event.result
      : toolCall?.result !== undefined
        ? toolCall.result
        : undefined;
  const error = errorFromResult(output);
  const status: ToolActivityStatus = error ? "error" : "completed";
  const existingIndex = toolIndex.get(id);

  if (existingIndex === undefined) {
    toolIndex.set(id, tools.length);
    tools.push({
      id,
      name,
      status,
      ...(toolCall?.arguments !== undefined
        ? { input: toolCall.arguments }
        : {}),
      ...(output !== undefined ? { output } : {}),
      ...(error ? { error } : {}),
    });
    return;
  }

  tools[existingIndex] = {
    ...tools[existingIndex],
    name: tools[existingIndex]?.name || name,
    status,
    ...(output !== undefined ? { output } : {}),
    ...(error ? { error } : {}),
  };
}

function addEvaluation(
  event: EmbeddedAgentEvent,
  steps: AgentStepSummary,
): void {
  const evaluation = asRecordOrUndefined(event.evaluation);
  if (!evaluation) return;
  const decision = String(evaluation.decision ?? "").toUpperCase();
  const success = evaluation.success !== false;
  if (decision === "CONTINUE") {
    steps.continued += 1;
  } else if (!success) {
    steps.failed += 1;
  } else {
    steps.finished += 1;
  }
}

export function parseAgentMessage(content: string): ParsedAgentMessage {
  const legacyToolResult =
    parseLegacyReadResult(content) ?? parseLegacySearchResult(content);
  if (legacyToolResult) {
    return {
      text: "This earlier response contained raw tool output without a final explanation. The output is preserved below.",
      tools: [legacyToolResult],
      steps: { continued: 0, finished: 0, failed: 0 },
    };
  }

  const tools: ToolActivity[] = [];
  const toolIndex = new Map<string, number>();
  const steps: AgentStepSummary = { continued: 0, finished: 0, failed: 0 };
  const visible: string[] = [];
  let cursor = 0;
  let match = EVENT_START.exec(content);

  while (match) {
    const start = match.index;
    const visiblePrefix = `${visible.join("")}${content.slice(cursor, start)}`;
    const range = isInsideCodeFence(visiblePrefix, visiblePrefix.length)
      ? undefined
      : readJsonObject(content, start);
    if (!range || !isEmbeddedAgentEvent(range.value)) {
      EVENT_START.lastIndex = start + 1;
      match = EVENT_START.exec(content);
      continue;
    }

    visible.push(content.slice(cursor, start));
    const event = range.value;
    if (event.type === "tool_call") {
      addToolCall(event, tools, toolIndex);
    } else if (event.type === "tool_result") {
      addToolResult(event, tools, toolIndex);
    } else {
      addEvaluation(event, steps);
    }
    cursor = range.end;
    EVENT_START.lastIndex = range.end;
    match = EVENT_START.exec(content);
  }

  visible.push(content.slice(cursor));
  EVENT_START.lastIndex = 0;
  return {
    text: normalizeVisibleText(visible.join("")),
    tools,
    steps,
  };
}

export function visibleAssistantText(content: string): string {
  return parseAgentMessage(content).text;
}

function parsePossibleJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function candidateSearchPayloads(value: unknown): unknown[] {
  const payloads = [parsePossibleJson(value)];
  const root = asRecordOrUndefined(payloads[0]);
  if (!root) return payloads;

  for (const candidate of [
    root.text,
    root.value,
    asRecordOrUndefined(root.data)?.value,
    asRecordOrUndefined(root.data)?.text,
  ]) {
    if (candidate !== undefined) payloads.push(parsePossibleJson(candidate));
  }
  return payloads;
}

export function webSearchResults(value: unknown): WebSearchResult[] {
  for (const payload of candidateSearchPayloads(value)) {
    const record = asRecordOrUndefined(payload);
    const results = Array.isArray(record?.results) ? record.results : undefined;
    if (!results) continue;
    return results.flatMap((candidate) => {
      const result = asRecordOrUndefined(candidate);
      const url = stringValue(result?.url);
      if (!result || !url || !/^https?:\/\//iu.test(url)) return [];
      const excerpts = Array.isArray(result.excerpts)
        ? result.excerpts.filter(
            (excerpt): excerpt is string => typeof excerpt === "string",
          )
        : [];
      return [
        {
          title: stringValue(result.title) ?? url,
          url,
          ...(excerpts[0]
            ? { excerpt: excerpts[0].replace(/\s+/gu, " ").trim() }
            : {}),
          ...(stringValue(result.publish_date)
            ? { publishDate: String(result.publish_date) }
            : {}),
        },
      ];
    });
  }
  return [];
}

export function formatToolPayload(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") {
    const parsed = parsePossibleJson(value);
    if (parsed !== value) return JSON.stringify(parsed, null, 2);
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
