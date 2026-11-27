import { escapeBlessed } from "../render-utils";
import {
  indentBlessedTranscriptBlock,
  isTranscriptTurnStart,
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
  const body = indentBlessedTranscriptBlock(
    renderBlessedBody(entry),
    entry.kind,
  );
  const toolTrace = indentBlessedTranscriptBlock(
    renderBlessedToolTrace(entry),
    entry.kind,
  );
  const severity = renderBlessedSeverity(entry);
  const metadata = [entry.elapsed, entry.at]
    .filter((value): value is string => Boolean(value))
    .map((value) => escapeBlessed(renderNormalizedLabel(value)))
    .join(" · ");

  return [
    `${renderBlessedRoleTag(entry.kind)}${customLabel}${severity ? ` ${severity}` : ""}${entry.pending ? " {gray-fg}…{/}" : ""}${metadata ? ` {gray-fg}· ${metadata}{/}` : ""}`,
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
    .map((entry, index) => {
      const rendered = renderBlessedEntry(entry);
      if (index === 0) {
        return rendered;
      }
      return `${isTranscriptTurnStart(entry) ? "\n\n{gray-fg}────────────{/}\n\n" : "\n\n"}${rendered}`;
    })
    .join("");
}
