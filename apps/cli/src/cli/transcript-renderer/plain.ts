import { stdout as output } from "node:process";
import type { CliTone } from "../activity-chrome";
import {
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

function indentPlainViewportBlock(
  block: string,
  accent: string,
  ansi: boolean,
): string {
  if (!block) {
    return block;
  }
  const gutter = paint("│", accent, ansi);
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

function renderTonePrefix(tone: CliTone | undefined, ansi: boolean): string {
  switch (tone) {
    case "warning":
      return paint("warn", ANSI.yellow, ansi);
    case "error":
      return paint("error", ANSI.magenta, ansi);
    case "success":
      return paint("done", ANSI.green, ansi);
    default:
      return "";
  }
}

export function renderPlainEntry(
  entry: ResponseTranscriptEntry,
  tone?: CliTone,
  options: {
    ansi?: boolean;
    collapseTrace?: boolean;
    viewport?: boolean;
  } = {},
): string {
  const ansi = options.ansi ?? output.isTTY;
  const accent = resolveAccent(entry.kind);
  const role = paint(renderPlainRoleLabel(entry.kind), accent, ansi);
  const customLabel = paint(renderPlainCustomLabel(entry), accent, ansi);
  const pending = entry.pending ? ` ${paint("...", ANSI.gray, ansi)}` : "";
  const severity =
    renderPlainSeverity(entry) || renderTonePrefix(entry.tone ?? tone, ansi);
  const metadata = [entry.elapsed, entry.at]
    .filter((value): value is string => Boolean(value))
    .map((value) => renderNormalizedLabel(value))
    .join(" · ");
  const metadataText = metadata ? paint(`  ${metadata}`, ANSI.gray, ansi) : "";
  const trace = renderPlainToolTrace(entry, {
    collapsed: options.collapseTrace,
  }).replace(/^\n/u, "");
  const blocks = [renderPlainBody(entry), trace].filter(Boolean);
  const body = options.viewport
    ? blocks
        .map((block) => indentPlainViewportBlock(block, accent, ansi))
        .join("\n")
    : blocks.join("\n");

  return `${role}${customLabel}${pending}${severity ? ` · ${severity}` : ""}${metadataText}\n${body}`;
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
      const rendered = renderPlainEntry(entry, undefined, { ansi: false });
      if (index === 0) {
        return rendered;
      }
      return `${isTranscriptTurnStart(entry) ? "\n\n------------\n\n" : "\n\n"}${rendered}`;
    })
    .join("");
}
