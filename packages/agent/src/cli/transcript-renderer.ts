import { stdout as output } from "node:process";
import type { CliTone } from "@/cli/activity-chrome";
import { escapeBlessed, sanitizeTerminalText } from "@/cli/render-utils";

const RESERVED_LABELS = new Set([
  "You",
  "Shell",
  "Command",
  "Command Result",
  "Helm Ready",
]);

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

export interface ResponseTranscriptEntry {
  label: string;
  body: string;
  at: string;
  elapsed?: string;
  kind?: "user" | "assistant" | "shell" | "command" | "system";
  pending?: boolean;
  liveActivity?: string[];
}

function asciiRoleBadge(kind?: ResponseTranscriptEntry["kind"]): string {
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

export function renderPlainEntry(
  entry: ResponseTranscriptEntry,
  tone?: CliTone,
): string {
  const accent =
    entry.kind === "user"
      ? ANSI.yellow
      : entry.kind === "assistant"
        ? ANSI.cyan
        : entry.kind === "shell"
          ? ANSI.green
          : entry.kind === "command"
            ? ANSI.magenta
            : ANSI.blue;
  const label = paint(entry.label, accent, output.isTTY);
  const badge = paint(asciiRoleBadge(entry.kind), ANSI.gray, output.isTTY);
  const at = paint(entry.at, ANSI.gray, output.isTTY);
  const elapsed = entry.elapsed
    ? paint(`· ${entry.elapsed}`, ANSI.gray, output.isTTY)
    : "";
  const pending = entry.pending
    ? ` ${paint("…", ANSI.gray, output.isTTY)}`
    : "";
  const body =
    sanitizeTerminalText(entry.body).trim() ||
    (entry.pending ? "thinking..." : "waiting...");
  const liveActivity =
    entry.liveActivity && entry.liveActivity.length > 0
      ? `\n${paint("activity", ANSI.gray, output.isTTY)}\n${entry.liveActivity
          .map((line) => `  ${sanitizeTerminalText(line)}`)
          .join("\n")}`
      : "";
  const prefix =
    tone === "warning"
      ? paint("warn", ANSI.yellow, output.isTTY)
      : tone === "error"
        ? paint("error", ANSI.magenta, output.isTTY)
        : tone === "success"
          ? paint("done", ANSI.green, output.isTTY)
          : "";

  return [
    `${at}  ${badge} ${label}${elapsed ? ` ${elapsed}` : ""}${pending}${prefix ? `  ${prefix}` : ""}`,
    body,
    liveActivity,
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderResponseTranscript(
  history: ResponseTranscriptEntry[],
  live?: ResponseTranscriptEntry,
): string {
  const sections = [...history];
  if (live) {
    sections.push(live);
  }
  if (!sections.length) {
    return "{gray-fg}Responses, JSON payloads, and operator output will render here.{/}";
  }

  const renderEntry = (entry: ResponseTranscriptEntry): string => {
    const roleTag =
      entry.kind === "user"
        ? "{yellow-fg}>> You{/}"
        : entry.kind === "assistant"
          ? "{cyan-fg}<> Agent{/}"
          : entry.kind === "shell"
            ? "{green-fg}$> Shell{/}"
            : entry.kind === "command"
              ? "{magenta-fg}// Command{/}"
              : "{gray-fg}:: System{/}";
    const customLabel =
      entry.label && !RESERVED_LABELS.has(entry.label)
        ? ` ${escapeBlessed(sanitizeTerminalText(entry.label, { preserveNewlines: false, collapseWhitespace: true }))}`
        : "";
    const safeBody = sanitizeTerminalText(entry.body);
    const body = safeBody.trim()
      ? escapeBlessed(safeBody)
      : entry.pending
        ? "{gray-fg}thinking…{/}"
        : "{gray-fg}waiting…{/}";
    const liveActivity =
      entry.liveActivity && entry.liveActivity.length > 0
        ? [
            "{gray-fg}activity{/}",
            ...entry.liveActivity.map((line) =>
              escapeBlessed(sanitizeTerminalText(line)),
            ),
          ].join("\n")
        : "";

    return [
      `{gray-fg}${escapeBlessed(sanitizeTerminalText(entry.at, { preserveNewlines: false, collapseWhitespace: true }))}{/} ${roleTag}${customLabel}${entry.elapsed ? ` {gray-fg}· ${escapeBlessed(sanitizeTerminalText(entry.elapsed, { preserveNewlines: false, collapseWhitespace: true }))}{/}` : ""}${entry.pending ? " {gray-fg}…{/}" : ""}`,
      body,
      liveActivity,
    ]
      .filter(Boolean)
      .join("\n");
  };

  return sections
    .slice(-24)
    .map((entry) => renderEntry(entry))
    .join("\n\n{gray-fg}────────────────────────────────{/}\n\n");
}

export function renderPlainTranscript(
  history: ResponseTranscriptEntry[],
  live?: ResponseTranscriptEntry,
): string {
  const sections = [...history];
  if (live) {
    sections.push(live);
  }
  if (!sections.length) {
    return "Responses will appear here.";
  }

  return sections
    .slice(-24)
    .map((entry) => {
      const role =
        entry.kind === "user"
          ? ">> You"
          : entry.kind === "assistant"
            ? "<> Agent"
            : entry.kind === "shell"
              ? "$> Shell"
              : entry.kind === "command"
                ? "// Command"
                : ":: System";
      const customLabel =
        entry.label && !RESERVED_LABELS.has(entry.label)
          ? ` ${sanitizeTerminalText(entry.label, {
              preserveNewlines: false,
              collapseWhitespace: true,
            })}`
          : "";
      const safeBody = sanitizeTerminalText(entry.body);
      const body = safeBody.trim()
        ? safeBody.trim()
        : entry.pending
          ? "thinking..."
          : "waiting...";
      const liveActivity =
        entry.liveActivity && entry.liveActivity.length > 0
          ? `\n[live activity]\n${entry.liveActivity
              .map((line) => sanitizeTerminalText(line))
              .join("\n")}`
          : "";

      return [
        `${sanitizeTerminalText(entry.at, { preserveNewlines: false, collapseWhitespace: true })} ${role}${customLabel}${entry.elapsed ? ` · ${sanitizeTerminalText(entry.elapsed, { preserveNewlines: false, collapseWhitespace: true })}` : ""}${entry.pending ? " ..." : ""}`,
        body,
        liveActivity,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n----------------------------------------\n\n");
}
