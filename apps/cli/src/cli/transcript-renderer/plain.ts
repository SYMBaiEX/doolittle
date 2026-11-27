import { stdout as output } from "node:process";
import type { CliTone } from "../activity-chrome";
import {
  asciiRoleBadge,
  isTranscriptTurnStart,
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

function indentPlainViewportBlock(block: string, accent: string): string {
  if (!block) {
    return block;
  }
  const gutter = paint("│", accent, output.isTTY);
  return block
    .split("\n")
    .map((line) => `${gutter} ${line}`)
    .join("\n");
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
  const metadata = [elapsed, at].filter(Boolean).join(" ");

  return [
    `${badge} ${label}${pending}${prefix ? `  ${prefix}` : ""}${metadata ? `  ${metadata}` : ""}`,
    indentPlainViewportBlock(renderPlainBody(entry), accent),
    indentPlainViewportBlock(toolTrace, accent),
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
    .map((entry, index) => {
      const customLabel = renderPlainCustomLabel(entry);
      const body = renderPlainBody(entry);
      const toolTrace = renderPlainToolTrace(entry);
      const severity = renderPlainSeverity(entry);
      const metadata = [entry.elapsed, entry.at]
        .filter((value): value is string => Boolean(value))
        .map((value) => renderNormalizedLabel(value))
        .join(" · ");
      const rendered = [
        `${renderPlainRoleLabel(entry.kind)}${customLabel}${severity ? ` · ${severity}` : ""}${entry.pending ? " ..." : ""}${metadata ? ` · ${metadata}` : ""}`,
        body,
        toolTrace,
      ]
        .filter(Boolean)
        .join("\n");
      if (index === 0) {
        return rendered;
      }
      return `${isTranscriptTurnStart(entry) ? "\n\n------------\n\n" : "\n\n"}${rendered}`;
    })
    .join("");
}
