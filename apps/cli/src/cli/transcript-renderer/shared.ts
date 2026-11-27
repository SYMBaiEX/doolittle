import { escapeBlessed, sanitizeTerminalText } from "../render-utils";
import type { ResponseTranscriptEntry } from "./types";

const RESERVED_LABELS = new Set([
  "You",
  "Shell",
  "Command",
  "Command Result",
  "Helm Ready",
]);

export function asciiRoleBadge(kind?: ResponseTranscriptEntry["kind"]): string {
  switch (kind) {
    case "user":
      return ">>";
    case "assistant":
      return "<>";
    case "shell":
      return "$>";
    case "command":
      return "//";
    default:
      return "::";
  }
}

export function renderBlessedRoleTag(
  kind?: ResponseTranscriptEntry["kind"],
): string {
  switch (kind) {
    case "user":
      return "{yellow-fg}>> You{/}";
    case "assistant":
      return "{cyan-fg}<> Agent{/}";
    case "shell":
      return "{green-fg}$> Shell{/}";
    case "command":
      return "{magenta-fg}// Command{/}";
    default:
      return "{gray-fg}:: System{/}";
  }
}

export function renderPlainRoleLabel(
  kind?: ResponseTranscriptEntry["kind"],
): string {
  switch (kind) {
    case "user":
      return ">> You";
    case "assistant":
      return "<> Agent";
    case "shell":
      return "$> Shell";
    case "command":
      return "// Command";
    default:
      return ":: System";
  }
}

// The transcript is the session's durable record: every section ever pushed
// stays renderable so viewport scrollback and the disk export both cover the
// full history. Windowing used to happen here (last 24 entries) which silently
// dropped older turns from the export as well — retention must never truncate.
export function normalizeTranscriptSections(
  history: ResponseTranscriptEntry[],
  live?: ResponseTranscriptEntry,
): ResponseTranscriptEntry[] {
  const sections = [...history];
  if (live) {
    sections.push(live);
  }
  return sections;
}

export function renderPlainBody(entry: ResponseTranscriptEntry): string {
  const safeBody = sanitizeTranscriptBody(entry.body);
  if (safeBody.trim()) {
    return safeBody.trim();
  }
  return entry.pending ? "thinking..." : "waiting...";
}

export function renderBlessedBody(entry: ResponseTranscriptEntry): string {
  const safeBody = sanitizeTranscriptBody(entry.body);
  if (safeBody.trim()) {
    return escapeBlessed(safeBody);
  }
  return entry.pending ? "{gray-fg}thinking…{/}" : "{gray-fg}waiting…{/}";
}

function sanitizeTranscriptBody(body: string): string {
  // Paths, diffs, and code can contain tokens much longer than a status label.
  return sanitizeTerminalText(body, { maxTokenLength: 4_000 });
}

export function renderNormalizedLabel(label: string): string {
  return sanitizeTerminalText(label, {
    preserveNewlines: false,
    collapseWhitespace: true,
  });
}

export function renderPlainCustomLabel(entry: ResponseTranscriptEntry): string {
  return entry.label && !RESERVED_LABELS.has(entry.label)
    ? ` ${renderNormalizedLabel(entry.label)}`
    : "";
}

export function renderBlessedCustomLabel(
  entry: ResponseTranscriptEntry,
): string {
  return entry.label && !RESERVED_LABELS.has(entry.label)
    ? ` ${escapeBlessed(renderNormalizedLabel(entry.label))}`
    : "";
}

const LIVE_TRACE_PREVIEW_LINES = 4;
const COMPLETED_TRACE_PREVIEW_LINES = 3;

function sanitizeToolTrace(entry: ResponseTranscriptEntry): string[] {
  return (entry.toolTrace ?? []).map((line) => sanitizeTerminalText(line));
}

function collapsedToolTrace(entry: ResponseTranscriptEntry): {
  hiddenCount: number;
  lines: string[];
  totalCount: number;
} {
  const trace = sanitizeToolTrace(entry);
  const previewLines = entry.pending
    ? LIVE_TRACE_PREVIEW_LINES
    : COMPLETED_TRACE_PREVIEW_LINES;
  const lines = trace.slice(-previewLines);
  return {
    hiddenCount: trace.length - lines.length,
    lines,
    totalCount: trace.length,
  };
}

function traceCountLabel(count: number): string {
  return `${count} event${count === 1 ? "" : "s"}`;
}

export function renderPlainToolTrace(
  entry: ResponseTranscriptEntry,
  options: { collapsed?: boolean } = {},
): string {
  const trace = sanitizeToolTrace(entry);
  if (!trace.length) {
    return "";
  }
  if (!options.collapsed) {
    return `\n[tool trace · ${traceCountLabel(trace.length)}]\n${trace.join("\n")}`;
  }
  const collapsed = collapsedToolTrace(entry);
  return [
    `[tool trace · ${traceCountLabel(collapsed.totalCount)}]`,
    ...collapsed.lines.map((line) => `  ${line}`),
    ...(collapsed.hiddenCount > 0
      ? [`  … ${collapsed.hiddenCount} earlier events in export`]
      : []),
  ].join("\n");
}

export function renderBlessedToolTrace(entry: ResponseTranscriptEntry): string {
  const collapsed = collapsedToolTrace(entry);
  if (!collapsed.totalCount) {
    return "";
  }
  return [
    `{gray-fg}activity · ${traceCountLabel(collapsed.totalCount)}{/}`,
    ...collapsed.lines.map((line) => escapeBlessed(line)),
    ...(collapsed.hiddenCount > 0
      ? [`{gray-fg}… ${collapsed.hiddenCount} earlier events in export{/}`]
      : []),
  ].join("\n");
}
