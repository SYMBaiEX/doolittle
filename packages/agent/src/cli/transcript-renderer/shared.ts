import { escapeBlessed, sanitizeTerminalText } from "@/cli/render-utils";
import type { ResponseTranscriptEntry } from "./types";

export const TRANSCRIPT_LIMIT = 24;

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

export function normalizeTranscriptSections(
  history: ResponseTranscriptEntry[],
  live?: ResponseTranscriptEntry,
): ResponseTranscriptEntry[] {
  const sections = [...history];
  if (live) {
    sections.push(live);
  }
  return sections.slice(-TRANSCRIPT_LIMIT);
}

export function renderPlainBody(entry: ResponseTranscriptEntry): string {
  const safeBody = sanitizeTerminalText(entry.body);
  if (safeBody.trim()) {
    return safeBody.trim();
  }
  return entry.pending ? "thinking..." : "waiting...";
}

export function renderBlessedBody(entry: ResponseTranscriptEntry): string {
  const safeBody = sanitizeTerminalText(entry.body);
  if (safeBody.trim()) {
    return escapeBlessed(safeBody);
  }
  return entry.pending ? "{gray-fg}thinking…{/}" : "{gray-fg}waiting…{/}";
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

export function renderPlainLiveActivity(
  entry: ResponseTranscriptEntry,
): string {
  return entry.liveActivity && entry.liveActivity.length > 0
    ? `\n[live activity]\n${entry.liveActivity
        .map((line) => sanitizeTerminalText(line))
        .join("\n")}`
    : "";
}

export function renderBlessedLiveActivity(
  entry: ResponseTranscriptEntry,
): string {
  return entry.liveActivity && entry.liveActivity.length > 0
    ? [
        "{gray-fg}activity{/}",
        ...entry.liveActivity.map((line) =>
          escapeBlessed(sanitizeTerminalText(line)),
        ),
      ].join("\n")
    : "";
}
