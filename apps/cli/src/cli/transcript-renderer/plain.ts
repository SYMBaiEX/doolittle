import { stdout as output } from "node:process";
import type { CliTone } from "../activity-chrome";
import {
  asciiRoleBadge,
  normalizeTranscriptSections,
  renderNormalizedLabel,
  renderPlainBody,
  renderPlainCustomLabel,
  renderPlainRoleLabel,
  renderPlainSeverity,
  renderPlainToolTrace,
} from "./shared";
import type { ResponseTranscriptEntry } from "./types";

const ANSI = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

function paint(text: string, color: string, enabled: boolean): string {
  return enabled ? `${color}${text}${ANSI.reset}` : text;
}

function resolveAccent(kind?: ResponseTranscriptEntry["kind"]): string {
  switch (kind) {
    case "user":
      return ANSI.yellow;
    case "assistant":
      return ANSI.cyan;
    case "shell":
      return ANSI.green;
    case "command":
      return ANSI.magenta;
    default:
      return ANSI.blue;
  }
}

function renderTonePrefix(tone?: CliTone): string {
  switch (tone) {
    case "warning":
      return paint("warn", ANSI.yellow, output.isTTY);
    case "error":
      return paint("error", ANSI.magenta, output.isTTY);
    case "success":
      return paint("done", ANSI.green, output.isTTY);
    default:
      return "";
  }
}

export function renderPlainEntry(
  entry: ResponseTranscriptEntry,
  tone?: CliTone,
): string {
  const accent = resolveAccent(entry.kind);
  const label = paint(renderNormalizedLabel(entry.label), accent, output.isTTY);
  const badge = paint(asciiRoleBadge(entry.kind), ANSI.gray, output.isTTY);
  const at = paint(renderNormalizedLabel(entry.at), ANSI.gray, output.isTTY);
  const elapsed = entry.elapsed
    ? paint(
        `· ${renderNormalizedLabel(entry.elapsed)}`,
        ANSI.gray,
        output.isTTY,
      )
    : "";
  const pending = entry.pending
    ? ` ${paint("…", ANSI.gray, output.isTTY)}`
    : "";
  const toolTrace = renderPlainToolTrace(entry, { collapsed: true });
  const prefix = renderTonePrefix(entry.tone ?? tone);

  return [
    `${at}  ${badge} ${label}${elapsed ? ` ${elapsed}` : ""}${pending}${prefix ? `  ${prefix}` : ""}`,
    renderPlainBody(entry),
    toolTrace,
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderPlainTranscript(
  history: ResponseTranscriptEntry[],
  live?: ResponseTranscriptEntry,
): string {
  const sections = normalizeTranscriptSections(history, live);
  if (!sections.length) {
    return "Responses will appear here.";
  }

  return sections
    .map((entry) => {
      const customLabel = renderPlainCustomLabel(entry);
      const body = renderPlainBody(entry);
      const toolTrace = renderPlainToolTrace(entry);
      const severity = renderPlainSeverity(entry);

      return [
        `${renderNormalizedLabel(entry.at)} ${renderPlainRoleLabel(entry.kind)}${customLabel}${severity ? ` · ${severity}` : ""}${entry.elapsed ? ` · ${renderNormalizedLabel(entry.elapsed)}` : ""}${entry.pending ? " ..." : ""}`,
        body,
        toolTrace,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n----------------------------------------\n\n");
}
