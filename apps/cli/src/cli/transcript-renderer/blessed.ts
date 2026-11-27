import { escapeBlessed } from "../render-utils";
import {
  normalizeTranscriptSections,
  renderBlessedBody,
  renderBlessedCustomLabel,
  renderBlessedRoleTag,
  renderBlessedSeverity,
  renderBlessedToolTrace,
  renderNormalizedLabel,
} from "./shared";
import type { ResponseTranscriptEntry } from "./types";

function renderBlessedEntry(entry: ResponseTranscriptEntry): string {
  const customLabel = renderBlessedCustomLabel(entry);
  const body = renderBlessedBody(entry);
  const toolTrace = renderBlessedToolTrace(entry);
  const severity = renderBlessedSeverity(entry);

  return [
    `{gray-fg}${escapeBlessed(renderNormalizedLabel(entry.at))}{/} ${renderBlessedRoleTag(entry.kind)}${customLabel}${severity ? ` ${severity}` : ""}${entry.elapsed ? ` {gray-fg}· ${escapeBlessed(renderNormalizedLabel(entry.elapsed))}{/}` : ""}${entry.pending ? " {gray-fg}…{/}" : ""}`,
    body,
    toolTrace,
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderResponseTranscript(
  history: ResponseTranscriptEntry[],
  live?: ResponseTranscriptEntry,
): string {
  const sections = normalizeTranscriptSections(history, live);
  if (!sections.length) {
    return "{gray-fg}Responses, JSON payloads, and operator output will render here.{/}";
  }

  return sections
    .map((entry) => renderBlessedEntry(entry))
    .join("\n\n{gray-fg}────────────────────────────────{/}\n\n");
}
