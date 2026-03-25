import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { platform } from "node:os";
import { basename, join, relative } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { inspect } from "node:util";
import blessed from "blessed";
import { buildHelpText } from "@/cli/help-text";
import {
  attachCliJob,
  cancelCliJob,
  cliJobStatusSummary,
  getCliJob,
  launchCliBackgroundJob,
  listCliJobs,
  renderCliJobReplay,
} from "@/cli/jobs";
import type { CliTurnEvent } from "@/cli/turn-events";
import { summarizeTransportInventory } from "@/gateway/transport-contract";
import type { AppContext } from "@/runtime/bootstrap";
import { executeSlashCommand, handleAgentTurn } from "@/runtime/chat";
import {
  COMMAND_CATALOG,
  canonicalizeSlashCommandSyntax,
  normalizeSlashCommandSyntax,
  suggestCommands,
} from "@/runtime/command-catalog";
import { getNativePackageAudit } from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import {
  getAutonomousControlPlane,
  getNativeEcosystemSnapshot,
  getNativeTransportControlPlane,
} from "@/runtime/native/service-bridge";
import { formatRunEvent, shouldRenderRunEvent } from "@/runtime/run-progress";
import { getTuiTheme, type TuiThemeProfile } from "@/runtime/theme-catalog";

interface CliState {
  activeSessionId: string;
  notices: Array<{
    kind: "context" | "skills" | "status";
    message: string;
    at: string;
  }>;
}

interface CliExecutionResult {
  text: string;
  tone?: "info" | "success" | "warning" | "error" | "agent";
  shouldExit?: boolean;
}

interface CliExecutionHooks {
  onStream?: (event: {
    source: "stdout" | "stderr";
    chunk: string;
    command: string;
  }) => void;
  onResponseProgress?: (event: { response: string }) => void;
  onNotice?: (event: {
    kind: "context" | "skills" | "status";
    message: string;
  }) => void;
  abortSignal?: AbortSignal;
}

export interface CliPromptRunOptions {
  sessionId?: string;
}

export interface CliPromptEventHandlers {
  onEvent?: (event: CliTurnEvent) => void | Promise<void>;
}

type ControlDeckMode =
  | "assist"
  | "ecosystem"
  | "gateway"
  | "responses"
  | "jobs";

const IS_MACOS = platform() === "darwin";

function macAwareKeyLabel(label: string): string {
  if (!IS_MACOS) {
    return label;
  }
  return label
    .replaceAll("Alt-", "Option-")
    .replaceAll("Alt", "Option")
    .replaceAll("PageUp/PageDown", "Fn-↑/Fn-↓ or PageUp/PageDown")
    .replaceAll("PgUp/PgDn", "Fn-↑/Fn-↓ or PgUp/PgDn");
}

export interface ResponseTranscriptEntry {
  label: string;
  body: string;
  at: string;
  kind?: "user" | "assistant" | "shell" | "command" | "system";
  pending?: boolean;
  liveActivity?: string[];
}

function nowStamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createCliSessionId(prefix = "cli"): string {
  return `${prefix}:${randomUUID()}`;
}

function compactJsonLine(value: unknown): string {
  const raw = JSON.stringify(value);
  return raw.length > 320 ? `${raw.slice(0, 317)}...` : raw;
}

function compactPreview(text: string): string {
  if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
    return truncate(text, 320);
  }

  try {
    return compactJsonLine(JSON.parse(text) as unknown);
  } catch {
    return truncate(text, 320);
  }
}

function isConversationalInput(text: string): boolean {
  const trimmed = text.trim();
  return !!trimmed && !trimmed.startsWith("/") && !trimmed.startsWith("!");
}

function truncate(text: string, max = 520): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > max
    ? `${normalized.slice(0, Math.max(0, max - 3))}...`
    : normalized;
}

function escapeBlessed(text: string): string {
  return text.replaceAll("{", "\\{").replaceAll("}", "\\}");
}

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

function paint(text: string, color: string, enabled: boolean): string {
  return enabled ? `${color}${text}${ANSI.reset}` : text;
}

function shortModelId(model: string): string {
  const normalized = model.trim();
  if (!normalized) {
    return "unconfigured";
  }
  const segments = normalized.split("/");
  return segments.at(-1) ?? normalized;
}

function currentWorkspaceLabel(): string {
  const cwd = process.cwd();
  const home = process.env.HOME;
  if (home && cwd.startsWith(home)) {
    const rel = relative(home, cwd);
    return rel ? `~/${rel}` : "~";
  }
  return cwd;
}

function currentProjectLabel(): string {
  return basename(process.cwd()) || currentWorkspaceLabel();
}

function shortSessionLabel(sessionId: string): string {
  return sessionId.startsWith("cli:")
    ? sessionId.slice(4, 12)
    : truncate(sessionId, 12);
}

function renderPlainBanner(context: AppContext, state: CliState): string {
  const settings = context.services.settings.get();
  const theme = getTuiTheme(settings.ui.theme);
  const cwd = currentWorkspaceLabel();
  const project = currentProjectLabel();
  const smallModel =
    settings.model.provider === "elizacloud"
      ? context.config.elizaCloudSmallModel
      : settings.model.model;
  const sessionSummary = context.services.sessions
    .listSessions(20)
    .find((entry) => entry.sessionId === state.activeSessionId);
  const session =
    sessionSummary?.title ?? shortSessionLabel(state.activeSessionId);

  const lines = [
    `┌─ ${theme.sigil} ${context.config.agentName.toUpperCase()} // conversation shell`,
    `│ project   ${project}`,
    `│ workspace ${cwd}`,
    `│ provider  ${settings.model.provider}   fast ${shortModelId(smallModel)}   deep ${shortModelId(settings.model.model)}`,
    `│ signal    ${theme.label} ${theme.idleFace}   run ${settings.agent.runDepth} cap ${settings.agent.maxIterations}   progress ${settings.agent.toolProgressMode}`,
    `│ session   ${session}`,
    `└─ ${theme.shellGlyph} terminal-first · cockpit optional · !shell · /help`,
  ];

  if (!output.isTTY) {
    return lines.join("\n");
  }

  return [
    paint(lines[0] ?? "", ANSI.bold + ANSI.magenta, true),
    paint(lines[1] ?? "", ANSI.cyan, true),
    paint(lines[2] ?? "", ANSI.gray, true),
    paint(lines[3] ?? "", ANSI.green, true),
    paint(lines[4] ?? "", ANSI.yellow, true),
    paint(lines[5] ?? "", ANSI.gray, true),
  ].join("\n");
}

function renderPlainShellHints(): string {
  return [
    "Talk naturally for paired work, use !cmd for shell execution, or use /slash commands for control-plane actions.",
    `Good first moves: ${canonicalizeSlashCommandSyntax("/status")}, ${canonicalizeSlashCommandSyntax("/mode")}, ${canonicalizeSlashCommandSyntax("/progress")}, ${canonicalizeSlashCommandSyntax("/accounts doctor")}, ${canonicalizeSlashCommandSyntax("/sessions list")}.`,
    'Use "eliza-agent cockpit" when you want the fullscreen operator deck.',
  ].join("\n");
}

function renderPlainPrompt(context: AppContext, _state: CliState): string {
  const settings = context.services.settings.get();
  const theme = getTuiTheme(settings.ui.theme);
  return `${paint(context.config.agentName.toLowerCase(), ANSI.magenta, output.isTTY)}@${paint(currentProjectLabel(), ANSI.cyan, output.isTTY)} ${paint(`${settings.agent.runDepth}/${settings.agent.maxIterations}`, ANSI.gray, output.isTTY)} ${paint(theme.shellGlyph, ANSI.yellow, output.isTTY)} `;
}

function renderPlainRunLine(detail: string): string {
  return `${paint("  •", ANSI.gray, output.isTTY)} ${paint(asciiRunBadge(detail), ANSI.blue, output.isTTY)} ${detail}`;
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

function asciiActivityBadge(kind: string): string {
  const normalized = kind.trim().toLowerCase();
  if (
    normalized === "exec" ||
    normalized === "shell" ||
    normalized === "cmd" ||
    normalized === "out"
  ) {
    return "$>";
  }
  if (
    normalized === "task" ||
    normalized === "delegate" ||
    normalized === "agent"
  ) {
    return "<>";
  }
  if (
    normalized === "gw" ||
    normalized === "gateway" ||
    normalized.startsWith("srv")
  ) {
    return "::";
  }
  if (normalized === "copy" || normalized === "theme") {
    return "[*]";
  }
  if (normalized === "warn") {
    return "[!]";
  }
  if (normalized === "err" || normalized === "runtime") {
    return "[x]";
  }
  if (normalized === "mem") {
    return "[#]";
  }
  return "[.]";
}

function asciiRunBadge(detail: string): string {
  const normalized = detail.toLowerCase();
  if (normalized.startsWith("run started")) {
    return "[boot]";
  }
  if (normalized.startsWith("thinking")) {
    return "(..)";
  }
  if (normalized.startsWith("tool ") || normalized.startsWith("acting")) {
    if (normalized.includes("workspace:search")) {
      return "[rg]";
    }
    if (normalized.includes("shell") || normalized.includes("terminal")) {
      return "$>";
    }
    if (normalized.includes("delegate")) {
      return "<>";
    }
    if (normalized.includes("repo") || normalized.includes("git")) {
      return "{g}";
    }
    return "[tool]";
  }
  if (
    normalized.startsWith("tool done") ||
    normalized.startsWith("action completed")
  ) {
    return "[ok]";
  }
  if (normalized.startsWith("waiting")) {
    return "(. )";
  }
  if (normalized.startsWith("pending approvals")) {
    return "[?]";
  }
  if (normalized.startsWith("run complete")) {
    return "[fin]";
  }
  if (normalized.startsWith("run error")) {
    return "[!!]";
  }
  if (normalized.startsWith("heartbeat")) {
    return "[hb]";
  }
  return "[..]";
}

function runStatusFace(theme: TuiThemeProfile, status?: string): string {
  switch (status) {
    case "thinking":
      return "(..)";
    case "acting":
      return "<>";
    case "waiting":
      return "(. )";
    case "complete":
      return "[ok]";
    case "error":
      return "[!!]";
    default:
      return theme.idleFace;
  }
}

function decorateLiveActivity(detail: string): string {
  return `${asciiRunBadge(detail)} ${detail}`;
}

function renderPlainEntry(
  entry: ResponseTranscriptEntry,
  tone?: CliExecutionResult["tone"],
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
  const pending = entry.pending
    ? ` ${paint("…", ANSI.gray, output.isTTY)}`
    : "";
  const body =
    entry.body.trim() || (entry.pending ? "thinking..." : "waiting...");
  const liveActivity =
    entry.liveActivity && entry.liveActivity.length > 0
      ? `\n${paint("activity", ANSI.gray, output.isTTY)}\n${entry.liveActivity
          .map((line) => `  ${line}`)
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
    `${at}  ${badge} ${label}${pending}${prefix ? `  ${prefix}` : ""}`,
    body,
    liveActivity,
  ]
    .filter(Boolean)
    .join("\n");
}

function writeTranscriptExport(
  context: AppContext,
  history: ResponseTranscriptEntry[],
): void {
  try {
    writeFileSync(
      join(context.config.dataDir, "latest-transcript.txt"),
      `${renderPlainTranscript(history)}\n`,
      "utf8",
    );
  } catch {
    // Best effort only.
  }
}

// biome-ignore lint/complexity/useRegexLiterals: A constructor keeps control-byte escapes explicit without tripping the control-character lint.
const ANSI_ESCAPE_PATTERN = new RegExp(
  "\\u001B(?:\\[[0-?]*[ -/]*[@-~]|\\][^\\u0007]*(?:\\u0007|\\u001B\\\\))",
  "gu",
);

function sanitizeForeignTerminalWrite(text: string): string {
  return text
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(/\r\n/gu, "\n")
    .replace(/\r/gu, "")
    .replaceAll(String.fromCharCode(0), "")
    .trim();
}

function formatForeignTerminalArgs(args: unknown[]): string {
  return args
    .map((value) => {
      if (typeof value === "string") {
        return value;
      }
      return inspect(value, {
        depth: 4,
        colors: false,
        compact: true,
        breakLength: 120,
      });
    })
    .join(" ");
}

function shouldSuppressForeignTerminalLine(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("dynamicpromptexecfromstate failed") ||
    normalized.includes("no settings state found for server") ||
    normalized.includes("[plugin:advanced-capabilities:action:settings]") ||
    normalized.includes("[batchembeddings] api error:") ||
    normalized.includes("failed query:") ||
    normalized.includes('"relationships"."source_entity_id"') ||
    normalized.includes("model call failed:") ||
    normalized.includes("was there a typo in the url or port") ||
    normalized.includes("is the computer able to access the url")
  );
}

function createBlessedOutputProxy(
  stream: NodeJS.WriteStream,
): NodeJS.WriteStream {
  const rawWrite = stream.write.bind(stream);
  return new Proxy(stream, {
    get(target, prop) {
      if (prop === "write") {
        return rawWrite;
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function getCliErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return String(error);
}

function isRecoverableProviderError(error: unknown): boolean {
  const normalized = getCliErrorMessage(error).toLowerCase();
  return (
    normalized.includes("cannot connect to api") ||
    normalized.includes("unable to connect") ||
    normalized.includes("failedtoopensocket") ||
    normalized.includes("connectionrefused") ||
    normalized.includes("no output generated") ||
    normalized.includes("unauthorized") ||
    normalized.includes("rate limit") ||
    normalized.includes("429") ||
    normalized.includes("database is shutting down") ||
    normalized.includes("operation rejected") ||
    normalized.includes("failed query: create schema")
  );
}

function isBenignCliShutdownError(error: unknown): boolean {
  const normalized = getCliErrorMessage(error).toLowerCase();
  return (
    normalized.includes("database is shutting down") ||
    normalized.includes("operation rejected") ||
    normalized.includes("err_use_after_close") ||
    normalized.includes("readline was closed")
  );
}

function formatRecoverableProviderError(error: unknown): string {
  const detail = getCliErrorMessage(error);
  return detail.length > 280 ? `${detail.slice(0, 277)}...` : detail;
}

function appendCliTrace(
  crashLogPath: string,
  label: string,
  detail?: string,
): void {
  if (process.env.ELIZA_AGENT_TUI_TRACE !== "1") {
    return;
  }
  try {
    appendFileSync(
      crashLogPath,
      `[${new Date().toISOString()}] ${label}${detail ? ` ${detail}` : ""}\n`,
      "utf8",
    );
  } catch {
    // Best effort only.
  }
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
      entry.label &&
      !["You", "Shell", "Command", "Command Result", "Helm Ready"].includes(
        entry.label,
      )
        ? ` ${escapeBlessed(entry.label)}`
        : "";
    const body = entry.body.trim()
      ? escapeBlessed(entry.body)
      : entry.pending
        ? "{gray-fg}thinking…{/}"
        : "{gray-fg}waiting…{/}";
    const liveActivity =
      entry.liveActivity && entry.liveActivity.length > 0
        ? [
            "{gray-fg}activity{/}",
            ...entry.liveActivity.map((line) => escapeBlessed(line)),
          ].join("\n")
        : "";

    return [
      `{gray-fg}${escapeBlessed(entry.at)}{/} ${roleTag}${customLabel}${entry.pending ? " {gray-fg}…{/}" : ""}`,
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

function renderPlainTranscript(
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
        entry.label &&
        !["You", "Shell", "Command", "Command Result", "Helm Ready"].includes(
          entry.label,
        )
          ? ` ${entry.label}`
          : "";
      const body = entry.body.trim()
        ? entry.body.trim()
        : entry.pending
          ? "thinking..."
          : "waiting...";
      const liveActivity =
        entry.liveActivity && entry.liveActivity.length > 0
          ? `\n[live activity]\n${entry.liveActivity.join("\n")}`
          : "";

      return [
        `${entry.at} ${role}${customLabel}${entry.pending ? " ..." : ""}`,
        body,
        liveActivity,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n----------------------------------------\n\n");
}

function toneTag(tone: CliExecutionResult["tone"]): string {
  switch (tone) {
    case "success":
      return "{green-fg}[ok]{/}";
    case "warning":
      return "{yellow-fg}[!]{/}";
    case "error":
      return "{red-fg}[x]{/}";
    case "agent":
      return "{cyan-fg}<> {/}";
    default:
      return "{blue-fg}:: {/}";
  }
}

function panelStyle(theme: TuiThemeProfile, accent: string) {
  return {
    fg: theme.baseFg,
    bg: theme.panelBg,
    border: { fg: accent },
    label: { fg: accent, bold: true },
    scrollbar: {
      fg: accent,
      bg: theme.panelBg,
    },
  };
}

function buildHeaderContent(agentName: string, theme: TuiThemeProfile): string {
  return [
    `{bold}${escapeBlessed(theme.sigil)} ${agentName}{/bold}  {black-fg}${escapeBlessed(theme.shellGlyph)} conversation shell{/}  {white-fg}${escapeBlessed(currentProjectLabel())}{/}`,
    `{white-fg}${theme.label}{/} ${escapeBlessed(theme.idleFace)} · {gray-fg}${escapeBlessed(theme.tagline)}{/} · {cyan-fg}cockpit for observability{/} · {green-fg}shell for everyday work{/}`,
  ].join("\n");
}

function applyLayout(
  screen: blessed.Widgets.Screen,
  layout: {
    header: blessed.Widgets.BoxElement;
    activity: blessed.Widgets.Log;
    response: blessed.Widgets.BoxElement;
    sidebar: blessed.Widgets.BoxElement;
    transportBox: blessed.Widgets.BoxElement;
    executionBox: blessed.Widgets.BoxElement;
    assistBox: blessed.Widgets.BoxElement;
    paletteOverlay: blessed.Widgets.BoxElement;
    paletteInput: blessed.Widgets.TextboxElement;
    paletteList: blessed.Widgets.ListElement;
    composerOverlay: blessed.Widgets.BoxElement;
    composer: blessed.Widgets.TextareaElement;
    inputBox: blessed.Widgets.TextboxElement;
    footer: blessed.Widgets.BoxElement;
  },
  options?: {
    opsCollapsed?: boolean;
  },
): void {
  const width = screen.width as number;
  const height = screen.height as number;
  const compact = width < 140;
  const narrow = width < 110;
  const short = height < 34;
  const opsCollapsed = options?.opsCollapsed ?? true;

  layout.header.top = 0;
  layout.header.left = 0;
  layout.header.width = "100%";
  layout.header.height = 3;

  layout.inputBox.left = 0;
  layout.inputBox.width = "100%";
  layout.inputBox.bottom = 1;
  layout.inputBox.height = 3;

  layout.footer.left = 0;
  layout.footer.width = "100%";
  layout.footer.bottom = 0;
  layout.footer.height = 1;

  if (narrow) {
    layout.response.top = 3;
    layout.response.left = 0;
    layout.response.width = "100%";
    layout.response.height = opsCollapsed
      ? short
        ? "66%-1"
        : "68%-1"
      : short
        ? "58%-1"
        : "60%-1";

    layout.activity.top = opsCollapsed
      ? short
        ? "66%+2"
        : "68%+2"
      : short
        ? "58%+2"
        : "60%+2";
    layout.activity.left = 0;
    layout.activity.width = "100%";
    layout.activity.height = opsCollapsed
      ? short
        ? "6%-2"
        : "8%-2"
      : short
        ? "10%-2"
        : "12%-2";

    layout.sidebar.top = opsCollapsed
      ? short
        ? "72%+2"
        : "76%+2"
      : short
        ? "68%+2"
        : "72%+2";
    layout.sidebar.left = 0;
    layout.sidebar.width = "100%";
    layout.sidebar.height = short ? "12%-2" : "14%-2";

    layout.transportBox.top = "100%";
    layout.transportBox.left = "100%";
    layout.transportBox.width = "0%";
    layout.transportBox.height = "0%";

    layout.executionBox.top = "100%";
    layout.executionBox.left = "100%";
    layout.executionBox.width = "0%";
    layout.executionBox.height = "0%";

    layout.assistBox.top = opsCollapsed
      ? short
        ? "84%+2"
        : "88%+2"
      : short
        ? "80%+2"
        : "84%+2";
    layout.assistBox.left = 0;
    layout.assistBox.width = "100%";
    layout.assistBox.height = short ? "10%-2" : "12%-2";
  } else if (compact) {
    layout.response.top = 3;
    layout.response.left = 0;
    layout.response.width = "86%";
    layout.response.height = opsCollapsed
      ? short
        ? "68%-1"
        : "70%-1"
      : short
        ? "61%-1"
        : "64%-1";

    layout.activity.top = opsCollapsed
      ? short
        ? "68%+2"
        : "70%+2"
      : short
        ? "61%+2"
        : "64%+2";
    layout.activity.left = 0;
    layout.activity.width = "86%";
    layout.activity.height = opsCollapsed
      ? short
        ? "14%-2"
        : "16%-2"
      : short
        ? "21%-2"
        : "24%-2";

    layout.sidebar.top = 3;
    layout.sidebar.left = "86%";
    layout.sidebar.width = "14%";
    layout.sidebar.height = short ? "28%" : "30%";

    layout.transportBox.top = short ? "22%+3" : "24%+3";
    layout.transportBox.left = "86%";
    layout.transportBox.width = "14%";
    layout.transportBox.height = "0%";

    layout.executionBox.top = short ? "40%+3" : "42%+3";
    layout.executionBox.left = "86%";
    layout.executionBox.width = "14%";
    layout.executionBox.height = "0%";

    layout.assistBox.top = short ? "48%+3" : "50%+3";
    layout.assistBox.left = "86%";
    layout.assistBox.width = "14%";
    layout.assistBox.height = short ? "39%-1" : "38%-1";
  } else {
    layout.response.top = 3;
    layout.response.left = 0;
    layout.response.width = "86%";
    layout.response.height = opsCollapsed ? "70%-1" : "64%-1";

    layout.activity.top = opsCollapsed ? "70%+2" : "64%+2";
    layout.activity.left = 0;
    layout.activity.width = "86%";
    layout.activity.height = opsCollapsed ? "16%-2" : "24%-2";

    layout.sidebar.top = 3;
    layout.sidebar.left = "86%";
    layout.sidebar.width = "14%";
    layout.sidebar.height = "84%-2";

    layout.transportBox.top = "3";
    layout.transportBox.left = "86%";
    layout.transportBox.width = "14%";
    layout.transportBox.height = "0%";

    layout.executionBox.top = "32%+2";
    layout.executionBox.left = "86%";
    layout.executionBox.width = "14%";
    layout.executionBox.height = "0%";

    layout.assistBox.top = "46%+3";
    layout.assistBox.left = "86%";
    layout.assistBox.width = "14%";
    layout.assistBox.height = short ? "38%-1" : "40%-1";
  }

  layout.paletteOverlay.width = narrow ? "94%" : compact ? "82%" : "72%";
  layout.paletteOverlay.height = narrow ? "76%" : "68%";
  layout.paletteOverlay.top = "center";
  layout.paletteOverlay.left = "center";
  layout.paletteInput.top = 0;
  layout.paletteInput.left = 0;
  layout.paletteInput.width = "100%-2";
  layout.paletteInput.height = 3;
  layout.paletteList.top = 3;
  layout.paletteList.left = 0;
  layout.paletteList.width = "100%-2";
  layout.paletteList.height = "100%-4";

  layout.composerOverlay.width = narrow ? "96%" : compact ? "88%" : "78%";
  layout.composerOverlay.height = narrow ? "82%" : "72%";
  layout.composerOverlay.top = "center";
  layout.composerOverlay.left = "center";
  layout.composer.width = "100%-2";
  layout.composer.height = "100%-4";
  layout.composer.top = 0;
  layout.composer.left = 0;
}

async function renderEcosystemContent(context: AppContext): Promise<string> {
  const snapshot = await getNativeEcosystemSnapshot(
    context.runtime,
    context.services,
    context.config,
    context.services.gatewayConfig,
  );
  const audit = snapshot.packageAudit;
  const resolution = snapshot.ownership.controlPlane.serviceResolution;
  const ecosystem = snapshot.workspace.summary;
  const latest = snapshot.runtime.latest;
  const alpha = snapshot.runtime.alpha;
  const aligned = audit.packages.filter(
    (entry: (typeof audit.packages)[number]) =>
      entry.compatibility === "aligned",
  ).length;
  const alphaOnly = audit.packages.filter(
    (entry: (typeof audit.packages)[number]) =>
      entry.compatibility === "alpha-only",
  ).length;
  const laggingLatest = audit.packages.filter(
    (entry: (typeof audit.packages)[number]) =>
      entry.compatibility === "lagging-latest",
  ).length;
  const vendored = audit.packages.filter(
    (entry: (typeof audit.packages)[number]) =>
      entry.compatibility === "vendored-by-design",
  ).length;
  const workspaceOnly = audit.packages.filter(
    (entry: (typeof audit.packages)[number]) =>
      entry.compatibility === "workspace-only",
  ).length;

  return [
    "{bold}Runtime Line{/}",
    `Latest: {cyan-fg}${latest}{/}`,
    `Alpha: {green-fg}${alpha}{/}`,
    "",
    "{bold}Package Audit{/}",
    `Aligned: ${aligned}`,
    `Alpha-only: ${alphaOnly}`,
    `Lagging latest: ${laggingLatest}`,
    `Vendored: ${vendored}`,
    `Workspace-only: ${workspaceOnly}`,
    `Native services: ${resolution.filter((entry) => entry.source === "native").length}/${resolution.length}`,
    `Workspace packs: benchmarks=${ecosystem.benchmarkPacks} channels=${ecosystem.distributionChannels} modeling=${ecosystem.modelingProfiles} optional=${ecosystem.optionalSkillPacks}`,
    "",
    "{bold}Priority Packages{/}",
    ...snapshot.packageAudit.packages
      .slice(0, 6)
      .map(
        (entry) =>
          `- ${entry.packageName} {gray-fg}[${entry.compatibility}] ${entry.currentTag}{/}`,
      ),
  ].join("\n");
}

async function renderGatewayOpsContent(context: AppContext): Promise<string> {
  const history = await context.gateway.history(6);
  const supervision = context.gateway.supervision(4);
  const latestInbox = history.inbox.at(0);
  const daemon = context.gateway.runtimeStatus().daemon;

  return [
    "{bold}Gateway Journal{/}",
    `Traces: ${history.traces.length}`,
    `Inbox: ${history.inbox.length}`,
    `Deliveries: ${history.deliveries.length}`,
    `Attachments: ${history.attachments.length}`,
    "",
    "{bold}Daemon{/}",
    `Watchdog: ${daemon.watchdog.running ? "{green-fg}running{/}" : "{red-fg}stopped{/}"}`,
    `Restarts: ${daemon.state.restartRuns} recoveries=${daemon.state.restartRecoveries} backoffs=${daemon.state.restartBackoffs}`,
    `Queue: ${daemon.restartQueue.length} pending`,
    daemon.state.lastWatchdogAt
      ? `Last watchdog: ${daemon.state.lastWatchdogAt}`
      : "Last watchdog: n/a",
    "",
    "{bold}Supervision{/}",
    ...(supervision.length
      ? supervision.map(
          (record) =>
            `- ${record.at.slice(11, 19)} ${truncate(record.detail, 30)}`,
        )
      : ["{gray-fg}No supervision records yet.{/}"]),
    "",
    "{bold}Replay Target{/}",
    latestInbox
      ? `Latest inbox: ${latestInbox.recordId}\n- ${latestInbox.platform} ${truncate(latestInbox.textPreview, 30)}`
      : "{gray-fg}No inbox records available.{/}",
  ].join("\n");
}

function renderResponsesContent(context: AppContext): string {
  const responses = context.services.apiTransport.list(5);
  return [
    "{bold}Responses API{/}",
    `Records: ${responses.length}`,
    "",
    ...(responses.length
      ? responses.map(
          (entry) =>
            `- ${entry.id}\n  room=${truncate(entry.roomId, 20)} prev=${entry.previousResponseId ?? "n/a"}`,
        )
      : ["{gray-fg}No responses recorded yet.{/}"]),
  ].join("\n");
}

function renderJobsContent(context: AppContext): string {
  const jobs = listCliJobs(context.config.dataDir).slice(0, 8);
  return [
    "{bold}Background Jobs{/}",
    `Tracked: ${jobs.length}`,
    "",
    ...(jobs.length
      ? jobs.map((job) => {
          const statusColor =
            job.status === "completed"
              ? "green-fg"
              : job.status === "running"
                ? "yellow-fg"
                : job.status === "failed"
                  ? "red-fg"
                  : job.status === "cancelled"
                    ? "magenta-fg"
                    : "cyan-fg";
          return [
            `- ${job.id.slice(0, 8)} {${statusColor}}[${job.status}]{/}`,
            `  prompt=${truncate(job.prompt, 34)}`,
            job.completedAt
              ? `  done=${job.completedAt.slice(11, 19)} exit=${job.exitCode ?? "n/a"}`
              : job.startedAt
                ? `  started=${job.startedAt.slice(11, 19)} pid=${job.pid ?? "n/a"}`
                : `  queued=${job.createdAt.slice(11, 19)}`,
          ].join("\n");
        })
      : ["{gray-fg}No detached jobs yet.{/}"]),
    "",
    "{bold}Shell Surface{/}",
    `- ${canonicalizeSlashCommandSyntax("/jobs")}`,
    `- ${canonicalizeSlashCommandSyntax("/jobs show <id>")}`,
    `- ${canonicalizeSlashCommandSyntax("/jobs attach <id>")}`,
    `- ${canonicalizeSlashCommandSyntax("/jobs cancel <id>")}`,
  ].join("\n");
}

async function renderTransportContent(context: AppContext): Promise<string> {
  const traces = context.gateway.trace(6);
  const inbox = context.gateway.inbox(3);
  const sessions = context.services.gatewaySessions.list().slice(0, 4);
  const runtimeStatus = context.gateway.runtimeStatus();
  const gatewayState = await context.gateway.state(12);
  const platformStates = gatewayState.platforms.slice(0, 4);
  const inventorySummary = summarizeTransportInventory(
    runtimeStatus.transportInventory,
    "cli",
  ).split("\n");

  return [
    "{bold}Canonical Transport Inventory{/}",
    `Live: ${runtimeStatus.transportControl.liveServices}/${runtimeStatus.transportControl.gatewayEnabled}`,
    `Operational: ${runtimeStatus.transportControl.operationalTransports}/${runtimeStatus.transportInventory.length}`,
    `Configured: ${gatewayState.totals.configuredPlatforms}  plugin-mediated: ${gatewayState.totals.pluginMediatedAdapters}`,
    `Sources: official=${runtimeStatus.transportControl.officialPlugins} custom=${runtimeStatus.transportControl.customTransports} product=${runtimeStatus.transportControl.productTransports}`,
    ...(inventorySummary.length ? ["", ...inventorySummary.slice(0, 2)] : []),
    "",
    "{bold}Recent Trace{/}",
    ...(traces.length
      ? traces.map(
          (trace) =>
            `:: ${trace.platform}:${trace.kind} ${truncate(trace.detail ?? trace.traceId, 34)}`,
        )
      : ["{gray-fg}No recent trace activity.{/}"]),
    "",
    "{bold}Platforms{/}",
    ...(platformStates.length
      ? platformStates.map(
          (entry) =>
            `- ${entry.platform} ${entry.transportState} ${entry.presence.status}${entry.nativePluginId ? ` plugin=${entry.nativePluginId}` : ""}`,
        )
      : ["{gray-fg}No enabled platform state yet.{/}"]),
    "",
    "{bold}Recent Inbox{/}",
    ...(inbox.length
      ? inbox.map(
          (entry) => `>> ${entry.platform} ${truncate(entry.textPreview, 32)}`,
        )
      : ["{gray-fg}No inbound messages recorded.{/}"]),
    "",
    "{bold}Gateway Sessions{/}",
    ...(sessions.length
      ? sessions.map(
          (entry) =>
            `- ${entry.platform} ${truncate(entry.roomId ?? entry.sessionKey, 26)}${
              entry.voiceMode ? " {cyan-fg}[voice]{/}" : ""
            }`,
        )
      : ["{gray-fg}No active gateway sessions.{/}"]),
  ].join("\n");
}

async function renderExecutionContent(context: AppContext): Promise<string> {
  const recent = context.services.terminal.recent(4);
  const delegation = context.services.delegation.overview();
  const pipeline = context.services.autocoderPipeline.summary();
  const pipelineRuns = context.services.autocoderPipeline.list(4);
  const pipelineWorkflows = context.services.autocoderPipeline.listWorkflows(3);
  const settings = context.services.settings.get();

  return [
    "{bold}Execution Deck{/}",
    `Backend: {cyan-fg}${settings.execution.backend}{/}`,
    `Diagnostics: ${canonicalizeSlashCommandSyntax("/execution status")}`,
    "",
    "{bold}Recent Shell{/}",
    ...(recent.length
      ? recent.map(
          (entry) =>
            `$> ${entry.backend} ${truncate(
              entry.command,
              32,
            )} (${entry.exitCode})`,
        )
      : ["{gray-fg}No command history yet.{/}"]),
    "",
    "{bold}Delegation{/}",
    `pending=${delegation.pending} running=${delegation.running} workers=${delegation.activeWorkers}`,
    "",
    "{bold}Pipeline{/}",
    `runs=${pipeline.total} workflows=${pipeline.workflows} failed=${pipeline.failed}`,
    pipeline.latest
      ? `Latest: ${pipeline.latest.kind} ${truncate(pipeline.latest.projectName ?? pipeline.latest.repositoryName ?? pipeline.latest.id, 26)}`
      : "Latest: n/a",
    pipeline.latestWorkflow
      ? `Latest workflow: ${truncate(pipeline.latestWorkflow.title, 26)} {gray-fg}${pipeline.latestWorkflow.status}{/}`
      : "Latest workflow: n/a",
    ...(pipelineRuns.length
      ? pipelineRuns.map(
          (entry) =>
            `- ${entry.kind} ${truncate(entry.projectName ?? entry.repositoryName ?? entry.id, 24)} {gray-fg}${entry.status}{/}`,
        )
      : ["{gray-fg}No pipeline runs yet.{/}"]),
    ...(pipelineWorkflows.length
      ? [
          "",
          "{bold}Workflow Graphs{/}",
          ...pipelineWorkflows.map(
            (entry) =>
              `- ${truncate(entry.title, 24)} runs=${entry.runIds.length} {gray-fg}${entry.status}{/}`,
          ),
        ]
      : []),
  ].join("\n");
}

function renderSuggestionsContent(
  inputValue: string,
  theme = getTuiTheme(),
): string {
  if (!inputValue.trim()) {
    return [
      `{gray-fg}   ${escapeBlessed(theme.sigil)} eliza signal deck ${escapeBlessed(theme.sigil)}{/}`,
      "",
      "{bold}Quick Ignition{/}",
      "",
      "{bold}Conversation{/}",
      "- summarize this repo and tell me what matters",
      "- what machine am I on and what tools can you use here",
      "- plan the next coding step for this project",
      "",
      "{bold}Local Work{/}",
      "- !pwd",
      "- !git status",
      "- !uname -a",
      "",
      "{bold}Operator Surface{/}",
      `- ${canonicalizeSlashCommandSyntax("/status")}`,
      `- ${canonicalizeSlashCommandSyntax("/accounts")}`,
      `- ${canonicalizeSlashCommandSyntax("/mode")}`,
      `- ${canonicalizeSlashCommandSyntax("/progress")}`,
      `- ${canonicalizeSlashCommandSyntax("/theme list")}`,
      `- ${canonicalizeSlashCommandSyntax("/gateway readiness")}`,
      "",
      "{bold}Quick Picks{/}",
      ...suggestCommands("", 4).map(
        (entry, index) =>
          `${index === 0 ? "{green-fg}*{/} " : "- "}${entry.command}\n  {gray-fg}${entry.description}{/}`,
      ),
      "",
      "{gray-fg}Tip: use Tab for the top suggestion, Ctrl-P for the command deck, and Ctrl-E for longform prompts.{/}",
    ].join("\n");
  }

  const suggestions = suggestCommands(inputValue, 6);
  const title = inputValue.trim()
    ? `{bold}Suggestions for{/} {cyan-fg}${truncate(inputValue, 24)}{/}`
    : "{bold}Suggested Commands{/}";

  return [
    title,
    "",
    ...suggestions.map(
      (entry, index) =>
        `${index === 0 ? "{green-fg}*{/} " : "- "}${entry.command}\n  {gray-fg}${entry.description}{/}`,
    ),
    "",
    "{bold}Explore{/}",
    ...Array.from(
      new Set(COMMAND_CATALOG.slice(0, 8).map((entry) => entry.category)),
    ).map((category) => `- ${category}`),
  ].join("\n");
}

async function executeCliInput(
  line: string,
  context: AppContext,
  state: CliState,
  hooks?: CliExecutionHooks,
): Promise<CliExecutionResult> {
  const trimmed = line.trim();
  const normalizedTrimmed = normalizeSlashCommandSyntax(trimmed);

  if (!trimmed) {
    return { text: "", tone: "info" };
  }
  if (trimmed === "exit" || trimmed === "quit") {
    return {
      text: "Closing Eliza Agent TUI.",
      tone: "success",
      shouldExit: true,
    };
  }
  if (normalizedTrimmed === "/help") {
    return { text: buildHelpText(context.config.agentName), tone: "info" };
  }
  if (normalizedTrimmed === "/jobs") {
    return {
      text: cliJobStatusSummary(context.config.dataDir),
      tone: "info",
    };
  }
  if (normalizedTrimmed.startsWith("/jobs start ")) {
    const prompt = normalizedTrimmed.replace("/jobs start ", "").trim();
    if (!prompt) {
      return { text: "Usage: /jobs start <prompt>", tone: "warning" };
    }
    const launcherPath = Bun.argv[1];
    if (!launcherPath) {
      return {
        text: "The launcher path is not available for background jobs in this shell.",
        tone: "error",
      };
    }
    const job = launchCliBackgroundJob({
      config: context.config,
      launcherPath,
      prompt,
      sessionId: createCliSessionId("job"),
    });
    return {
      text: `Started background job ${job.id}.\nUse /jobs to list jobs, /jobs show ${job.id} to replay output, or /jobs attach ${job.id} to follow it live.`,
      tone: "success",
    };
  }
  if (normalizedTrimmed.startsWith("/jobs cancel ")) {
    const jobId = normalizedTrimmed.replace("/jobs cancel ", "").trim();
    if (!jobId) {
      return { text: "Usage: /jobs cancel <job-id>", tone: "warning" };
    }
    const cancelled = cancelCliJob(context.config.dataDir, jobId);
    return cancelled
      ? {
          text: `Cancelled background job ${cancelled.id}.`,
          tone: "success",
        }
      : {
          text: `Background job not found: ${jobId}`,
          tone: "warning",
        };
  }
  if (normalizedTrimmed.startsWith("/jobs show ")) {
    const jobId = normalizedTrimmed.replace("/jobs show ", "").trim();
    if (!jobId) {
      return { text: "Usage: /jobs show <job-id>", tone: "warning" };
    }
    const job = getCliJob(context.config.dataDir, jobId);
    if (!job) {
      return { text: `Background job not found: ${jobId}`, tone: "warning" };
    }
    return {
      text: renderCliJobReplay(context.config.dataDir, jobId),
      tone: "info",
    };
  }
  if (normalizedTrimmed.startsWith("/jobs attach ")) {
    const jobId = normalizedTrimmed.replace("/jobs attach ", "").trim();
    if (!jobId) {
      return { text: "Usage: /jobs attach <job-id>", tone: "warning" };
    }
    const job = await attachCliJob(context.config.dataDir, jobId, {
      onEvent: async (event) => {
        if (event.type === "run") {
          await hooks?.onNotice?.({
            kind: "status",
            message: event.detail,
          });
          return;
        }
        if (event.type === "progress") {
          await hooks?.onResponseProgress?.({ response: event.response });
        }
      },
    });
    if (!job) {
      return { text: `Background job not found: ${jobId}`, tone: "warning" };
    }
    return {
      text: renderCliJobReplay(context.config.dataDir, jobId),
      tone:
        job.status === "failed"
          ? "warning"
          : job.status === "cancelled"
            ? "warning"
            : "success",
    };
  }

  const runShellFlow = async (
    command: string,
    onSuccess?: () => Promise<string | undefined>,
  ): Promise<CliExecutionResult> => {
    const result = await context.services.terminal.runStreamingLocal(
      command,
      {
        onStdout: (chunk) => {
          hooks?.onStream?.({
            source: "stdout",
            chunk,
            command,
          });
        },
        onStderr: (chunk) => {
          hooks?.onStream?.({
            source: "stderr",
            chunk,
            command,
          });
        },
      },
      undefined,
      hooks?.abortSignal,
    );
    const followUp =
      result.exitCode === 0 && onSuccess ? await onSuccess() : undefined;
    return {
      text: [
        `$ ${result.command}`,
        "",
        result.stdout || "(no stdout)",
        result.stderr ? `\n[stderr]\n${result.stderr}` : "",
        `\nexit=${result.exitCode} duration=${result.durationMs ?? "n/a"}ms`,
        followUp ? `\n${followUp}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      tone: result.exitCode === 0 ? "success" : "warning",
    };
  };

  if (
    normalizedTrimmed.startsWith("/") &&
    !normalizedTrimmed.startsWith("/resume ") &&
    normalizedTrimmed !== "/resume" &&
    !normalizedTrimmed.startsWith("/title ")
  ) {
    const response = await executeSlashCommand(
      {
        message: normalizedTrimmed,
        userId: "local-user",
        roomId: state.activeSessionId,
        source: "cli",
      },
      context,
      {
        onResponseProgress: ({ response }) =>
          hooks?.onResponseProgress?.({ response }),
        onNotice: (notice) => hooks?.onNotice?.(notice),
        runLocalShellCommand: async ({
          command,
          afterSuccessConnectProvider,
        }) => {
          const result = await runShellFlow(
            command,
            afterSuccessConnectProvider
              ? async () =>
                  executeSlashCommand(
                    {
                      message: canonicalizeSlashCommandSyntax(
                        `/accounts connect ${afterSuccessConnectProvider}`,
                      ),
                      userId: "local-user",
                      roomId: state.activeSessionId,
                      source: "cli",
                    },
                    context,
                  )
              : undefined,
          );
          return result.text;
        },
      },
    );
    if (response !== undefined) {
      return { text: response, tone: "info" };
    }
  }
  if (normalizedTrimmed === "/resume") {
    const titled = context.services.sessions.listTitled(10);
    return {
      text: titled.length
        ? titled
            .map(
              (session) =>
                `- ${session.title ?? "(untitled)"}\n  session=${session.sessionId} messages=${session.messageCount} ended=${session.endedAt ?? "n/a"}`,
            )
            .join("\n")
        : "No titled sessions are available yet. Use /title <name> to name the current session.",
      tone: "info",
    };
  }
  if (normalizedTrimmed.startsWith("/resume ")) {
    const query = normalizedTrimmed.replace("/resume ", "").trim();
    const target = context.services.sessions.resolveByTitle(query);
    if (!target) {
      return {
        text: `Session not found for title: ${query}`,
        tone: "warning",
      };
    }
    state.activeSessionId = target.sessionId;
    return {
      text: `Resumed session ${target.title ?? target.sessionId}.`,
      tone: "success",
    };
  }

  if (normalizedTrimmed.startsWith("/title ")) {
    const title = normalizedTrimmed.replace("/title ", "").trim();
    if (!title) {
      return { text: "Usage: /title <name>", tone: "warning" };
    }
    const updated = context.services.sessions.rename(
      state.activeSessionId,
      title,
    );
    return {
      text: `Session titled: ${updated.title ?? title}`,
      tone: "success",
    };
  }

  const response = await handleAgentTurn(
    {
      message: normalizedTrimmed,
      userId: "local-user",
      roomId: state.activeSessionId,
      source: "cli",
    },
    context,
    {
      onResponseProgress: ({ response }) =>
        hooks?.onResponseProgress?.({ response }),
      onNotice: (notice) => hooks?.onNotice?.(notice),
      abortSignal: hooks?.abortSignal,
    },
  );

  return { text: response, tone: "agent" };
}

export async function runCliPrompt(
  context: AppContext,
  line: string,
  options?: CliPromptRunOptions,
): Promise<CliExecutionResult> {
  const state: CliState = {
    activeSessionId: options?.sessionId ?? createCliSessionId("cli"),
    notices: [],
  };
  return executeCliInput(line, context, state);
}

export async function runCliPromptWithEvents(
  context: AppContext,
  line: string,
  handlers?: CliPromptEventHandlers,
  options?: CliPromptRunOptions & { abortSignal?: AbortSignal },
): Promise<{ result: CliExecutionResult; sessionId: string }> {
  const state: CliState = {
    activeSessionId: options?.sessionId ?? createCliSessionId("cli"),
    notices: [],
  };
  let previousResponse = "";
  const command = line.trim();

  await handlers?.onEvent?.({
    type: "start",
    timestamp: new Date().toISOString(),
    sessionId: state.activeSessionId,
    command,
  });

  const unsubscribeRunUpdates = context.services.runController.onUpdate(
    async (event) => {
      if (event.sessionId !== state.activeSessionId) {
        return;
      }
      if (!shouldRenderRunEvent(event.run.progressMode, event)) {
        return;
      }
      const detail = formatRunEvent(event, 120);
      if (!detail) {
        return;
      }
      await handlers?.onEvent?.({
        type: "run",
        timestamp: new Date().toISOString(),
        runEventType: event.type,
        detail,
      });
    },
  );

  try {
    const result = await executeCliInput(line, context, state, {
      abortSignal: options?.abortSignal,
      onNotice: async (notice) => {
        await handlers?.onEvent?.({
          type: "notice",
          timestamp: new Date().toISOString(),
          kind: notice.kind,
          message: notice.message,
        });
      },
      onResponseProgress: async ({ response }) => {
        const delta = response.startsWith(previousResponse)
          ? response.slice(previousResponse.length)
          : response;
        previousResponse = response;
        await handlers?.onEvent?.({
          type: "progress",
          timestamp: new Date().toISOString(),
          phase: "model",
          chunk: delta,
          response,
          delta,
        });
      },
    });
    await handlers?.onEvent?.({
      type: "result",
      timestamp: new Date().toISOString(),
      text: result.text,
      tone: result.tone ?? "info",
      shouldExit: result.shouldExit ?? false,
    });
    await handlers?.onEvent?.({
      type: "completed",
      timestamp: new Date().toISOString(),
      status: result.shouldExit ? "cancelled" : "completed",
    });
    return {
      result,
      sessionId: state.activeSessionId,
    };
  } catch (error) {
    const message = getCliErrorMessage(error);
    await handlers?.onEvent?.({
      type: "error",
      timestamp: new Date().toISOString(),
      message,
    });
    await handlers?.onEvent?.({
      type: "completed",
      timestamp: new Date().toISOString(),
      status: options?.abortSignal?.aborted === true ? "cancelled" : "failed",
    });
    throw error;
  } finally {
    unsubscribeRunUpdates();
  }
}

export function resolveStaticCliInput(
  line: string,
  agentName: string,
): CliExecutionResult | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return { text: "", tone: "info" };
  }
  const normalizedTrimmed = normalizeSlashCommandSyntax(trimmed);
  if (trimmed === "exit" || trimmed === "quit") {
    return {
      text: `Closing ${agentName}.`,
      tone: "success",
      shouldExit: true,
    };
  }
  if (normalizedTrimmed === "/help") {
    return { text: buildHelpText(agentName), tone: "info" };
  }
  return undefined;
}

interface StartCliOptions {
  onReady?: () => void;
  bootLogs?: Array<{
    source: "stdout" | "stderr";
    text: string;
  }>;
}

type InteractiveTextEntry = blessed.Widgets.TextboxElement &
  blessed.Widgets.TextareaElement & {
    _reading?: boolean;
    readInput?: () => void;
    cancel?: () => void;
  };

async function startPlainCli(
  context: AppContext,
  options?: StartCliOptions,
): Promise<void> {
  const rl = createInterface({ input, output });
  const interactiveShell = input.isTTY && output.isTTY;
  const state: CliState = {
    activeSessionId: createCliSessionId("cli"),
    notices: [],
  };
  let closed = false;
  let activeTurnAbortController: AbortController | null = null;
  let lastRenderedRunEventKey = "";
  const responseHistory: ResponseTranscriptEntry[] = [];
  const crashLogPath = join(context.config.dataDir, "cli-crash.log");
  const requestActiveTurnCancellation = (): boolean => {
    if (
      !activeTurnAbortController ||
      activeTurnAbortController.signal.aborted
    ) {
      return false;
    }
    activeTurnAbortController.abort();
    output.write(
      `${interactiveShell ? "\n" : ""}${renderPlainRunLine("cancel requested · waiting for the active turn to stop")}\n`,
    );
    return true;
  };
  const pushPlainEntry = (
    entry: ResponseTranscriptEntry,
    tone?: CliExecutionResult["tone"],
  ) => {
    responseHistory.push(entry);
    if (responseHistory.length > 48) {
      responseHistory.splice(0, responseHistory.length - 48);
    }
    writeTranscriptExport(context, responseHistory);
    if (!interactiveShell) {
      output.write(`${entry.body.trim()}\n`);
      return;
    }
    output.write(`\n${renderPlainEntry(entry, tone)}\n\n`);
  };
  const unsubscribeRunUpdates = context.services.runController.onUpdate(
    (event) => {
      if (!interactiveShell) {
        return;
      }
      if (event.sessionId !== state.activeSessionId) {
        return;
      }
      if (!shouldRenderRunEvent(event.run.progressMode, event)) {
        return;
      }
      const detail = formatRunEvent(event);
      if (!detail) {
        return;
      }
      const renderKey = `${event.type}:${detail}`;
      if (renderKey === lastRenderedRunEventKey) {
        return;
      }
      lastRenderedRunEventKey = renderKey;
      output.write(`\n${renderPlainRunLine(detail)}\n`);
    },
  );

  const logFatal = (label: string, error: unknown) => {
    const detail =
      error instanceof Error ? error.stack || error.message : String(error);
    try {
      appendFileSync(
        crashLogPath,
        `[${new Date().toISOString()}] ${label}\n${detail}\n\n`,
        "utf8",
      );
    } catch {
      // Best effort only.
    }
  };

  const handleRecoverableRuntimeError = (error: unknown): boolean => {
    if (closed && isBenignCliShutdownError(error)) {
      return true;
    }
    if (closed || !isRecoverableProviderError(error)) {
      return false;
    }
    logFatal("plain-cli-recoverable", error);
    output.write(
      `\nRuntime error: ${formatRecoverableProviderError(error)}\n\n`,
    );
    return true;
  };

  const handleUncaughtException = (error: unknown) => {
    if (handleRecoverableRuntimeError(error)) {
      return;
    }
    logFatal("plain-cli-uncaughtException", error);
    output.write(`\nFatal CLI error. Crash log: ${crashLogPath}\n`);
    if (!closed) {
      rl.close();
    }
  };

  const handleUnhandledRejection = (error: unknown) => {
    if (handleRecoverableRuntimeError(error)) {
      return;
    }
    logFatal("plain-cli-unhandledRejection", error);
    output.write(`\nFatal CLI rejection. Crash log: ${crashLogPath}\n`);
    if (!closed) {
      rl.close();
    }
  };

  process.on("uncaughtException", handleUncaughtException);
  process.on("unhandledRejection", handleUnhandledRejection);
  const handleSigint = () => {
    if (requestActiveTurnCancellation()) {
      return;
    }
    if (!closed) {
      rl.close();
    }
  };
  process.on("SIGINT", handleSigint);

  rl.on("close", () => {
    closed = true;
  });

  if (interactiveShell) {
    output.write(
      `${paint(renderPlainBanner(context, state), ANSI.bold, true)}\n`,
    );
    output.write(`${paint(renderPlainShellHints(), ANSI.gray, true)}\n\n`);
    for (const entry of options?.bootLogs ?? []) {
      output.write(
        `${renderPlainRunLine(`boot ${entry.source === "stderr" ? "warn" : "info"} · ${entry.text}`)}\n`,
      );
    }
    if ((options?.bootLogs?.length ?? 0) > 0) {
      output.write("\n");
    }
  }
  if (interactiveShell) {
    options?.onReady?.();
  }
  if (input.isTTY && output.isTTY) {
    setTimeout(() => {
      void context.ensureDeferredHydration("plain-cli").catch((error) => {
        if (handleRecoverableRuntimeError(error)) {
          return;
        }
        logFatal("plain-cli-deferred-hydration", error);
        output.write(
          `\nDeferred startup failed: ${formatRecoverableProviderError(error)}\n\n`,
        );
      });
    }, 25).unref?.();
  }
  try {
    while (true) {
      let line = "";
      try {
        line = (
          await rl.question(
            interactiveShell ? renderPlainPrompt(context, state) : "",
          )
        ).trim();
      } catch (error) {
        if (
          closed ||
          (error instanceof Error &&
            "code" in error &&
            error.code === "ERR_USE_AFTER_CLOSE")
        ) {
          break;
        }
        throw error;
      }

      if (!line) {
        continue;
      }
      lastRenderedRunEventKey = "";
      const entryAt = nowStamp();
      const entryKind: ResponseTranscriptEntry["kind"] = isConversationalInput(
        line,
      )
        ? "user"
        : line.startsWith("!")
          ? "shell"
          : "command";
      const entryLabel =
        entryKind === "user"
          ? "You"
          : entryKind === "shell"
            ? "Shell"
            : "Command";
      responseHistory.push({
        label: entryLabel,
        body: line,
        at: entryAt,
        kind: entryKind,
      });
      writeTranscriptExport(context, responseHistory);

      try {
        activeTurnAbortController = new AbortController();
        const result = await executeCliInput(line, context, state, {
          abortSignal: activeTurnAbortController.signal,
        });
        if (result.text) {
          pushPlainEntry(
            {
              label:
                result.tone === "agent"
                  ? context.config.agentName
                  : line.startsWith("!")
                    ? "Shell"
                    : line.startsWith("/")
                      ? "Command Result"
                      : context.config.agentName,
              body: result.text,
              at: nowStamp(),
              kind:
                result.tone === "agent"
                  ? "assistant"
                  : line.startsWith("!")
                    ? "shell"
                    : line.startsWith("/")
                      ? "command"
                      : "assistant",
            },
            result.tone,
          );
        }
        if (!interactiveShell) {
          break;
        }
        if (result.shouldExit) {
          break;
        }
      } catch (error) {
        pushPlainEntry(
          {
            label: "Error",
            body: getCliErrorMessage(error),
            at: nowStamp(),
            kind: "system",
          },
          "error",
        );
      } finally {
        activeTurnAbortController = null;
      }
    }
  } finally {
    if (!closed) {
      rl.close();
    }
    unsubscribeRunUpdates();
    process.removeListener("uncaughtException", handleUncaughtException);
    process.removeListener("unhandledRejection", handleUnhandledRejection);
    process.removeListener("SIGINT", handleSigint);
    if (!interactiveShell) {
      process.exit(0);
    }
  }
}

function renderStatusContent(context: AppContext, state: CliState): string {
  const settings = context.services.settings.get();
  const theme = getTuiTheme(settings.ui.theme);
  const activeRun = context.services.runController.getActive(
    state.activeSessionId,
  );
  const plugins = getNativePluginCatalog(context.config);
  const audit = getNativePackageAudit(context.config);
  const sessions = context.services.sessions.listSessions(6);
  const delegation = context.services.delegation.overview();
  const gatewaySessions = context.services.gatewaySessions.list();
  const transportControl = getNativeTransportControlPlane(
    context.runtime,
    context.config,
    context.services.gatewayConfig,
  );
  const autonomousControl = getAutonomousControlPlane(
    context.runtime,
    context.services,
    context.config,
  );
  const startup = context.services.startupState.getSnapshot();
  const active = sessions.find(
    (entry) => entry.sessionId === state.activeSessionId,
  );

  return [
    "{bold}Signal Rail{/}",
    `{gray-fg}${escapeBlessed(theme.sigil)} ${escapeBlessed(theme.label)} ${escapeBlessed(runStatusFace(theme, activeRun?.status))}{/}`,
    `{cyan-fg}${settings.model.provider}{/} · {cyan-fg}${escapeBlessed(settings.model.model)}{/}`,
    `${escapeBlessed(autonomousControl.alignment.connection.kind)}${autonomousControl.alignment.connection.provider ? ` via ${escapeBlessed(autonomousControl.alignment.connection.provider)}` : ""}`,
    `startup ${startup.hotPathReady ? "hot-ready" : "warming"} · deferred ${startup.deferredReady ? "ready" : "warming"}`,
    `run ${settings.agent.runDepth} · cap ${settings.agent.maxIterations} · progress ${settings.agent.toolProgressMode}`,
    activeRun
      ? `live ${activeRun.status} · ${activeRun.observedActionCount} steps${activeRun.activeAction ? ` · ${escapeBlessed(truncate(activeRun.activeAction, 26))}` : activeRun.statusDetail ? ` · ${escapeBlessed(truncate(activeRun.statusDetail, 26))}` : ""}`
      : "{gray-fg}live idle{/}",
    `hydration gw:${startup.phases.gateway.status} cron:${startup.phases.cron.status} diag:${startup.phases.diagnostics.status} skills:${startup.phases.skills.status}`,
    `channels live=${transportControl.totals.liveServices} configured=${transportControl.totals.gatewayEnabled} ready=${transportControl.totals.operationalTransports}`,
    `delegation ${delegation.running}/${delegation.pending}/${delegation.completed} · workers ${delegation.activeWorkers}`,
    `gateway sessions ${gatewaySessions.length} · voice ${gatewaySessions.filter((entry) => entry.voiceMode).length}`,
    active?.title
      ? `session ${truncate(active.title, 28)}`
      : `session ${state.activeSessionId}`,
    "",
    "{bold}Live Notices{/}",
    ...(state.notices.length
      ? state.notices.slice(0, 3).map((entry) => {
          const accent =
            entry.kind === "context"
              ? "{yellow-fg}CTX{/}"
              : entry.kind === "skills"
                ? "{magenta-fg}SKL{/}"
                : "{cyan-fg}SYS{/}";
          return `${accent} {gray-fg}${escapeBlessed(entry.at)}{/} ${escapeBlessed(truncate(entry.message, 84))}`;
        })
      : ["{gray-fg}No active notices.{/}"]),
    "",
    "{gray-fg}plugins{/}: enabled=" +
      `${plugins.filter((entry) => entry.enabled).length}/${plugins.length}` +
      ` · alpha=${audit.runtime.alpha}`,
    "",
    "{bold}Recent Sessions{/}",
    ...sessions.slice(0, 4).map((entry) => {
      const marker = entry.sessionId === state.activeSessionId ? "*" : "-";
      return `${marker} ${truncate(entry.title ?? entry.sessionId, 26)}`;
    }),
  ].join("\n");
}

export function renderFooter(
  context: AppContext,
  busy: boolean,
  queueDepth: number,
  hint = "Esc input",
  busyFrame = "•",
): string {
  const settings = context.services.settings.get();
  const theme = getTuiTheme(settings.ui.theme);
  return [
    `${theme.sigil} ${context.config.agentName} // cockpit`,
    busy
      ? `{yellow-fg}${escapeBlessed(busyFrame)} processing{/}`
      : `{green-fg}${escapeBlessed(theme.idleFace)} ready{/}`,
    queueDepth > 0 ? `{cyan-fg}queue:${queueDepth}{/}` : "{gray-fg}queue:0{/}",
    `{cyan-fg}${escapeBlessed(shortModelId(settings.model.model))}{/}`,
    `{yellow-fg}${escapeBlessed(settings.agent.runDepth)}{/}`,
    `cap:${settings.agent.maxIterations}`,
    `prog:${escapeBlessed(settings.agent.toolProgressMode)}`,
    "{magenta-fg}Tab{/} cycle",
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-P"))}{/} commands`,
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-E"))}{/} draft`,
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-O"))}{/} activity`,
    "{cyan-fg}!cmd{/} shell",
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-T"))}{/} theme`,
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Alt-1..4"))}{/} decks`,
    hint,
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-Q"))}{/} quit`,
  ].join("  |  ");
}

async function startTui(
  context: AppContext,
  options?: StartCliOptions,
): Promise<"exited" | "unexpected"> {
  const state: CliState = {
    activeSessionId: createCliSessionId("cli"),
    notices: [],
  };
  const unsubscribers: Array<() => void> = [];
  let activeTheme = getTuiTheme(context.services.settings.get().ui.theme);
  const tuiOutput = createBlessedOutputProxy(output);
  const screen = blessed.screen({
    input,
    output: tuiOutput,
    smartCSR: true,
    fullUnicode: true,
    title: `${context.config.agentName} TUI`,
    dockBorders: true,
  });

  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    style: {
      fg: activeTheme.baseFg,
      bg: activeTheme.primary,
    },
    content: buildHeaderContent(context.config.agentName, activeTheme),
  });

  const activity = blessed.log({
    parent: screen,
    top: "64%+2",
    left: 0,
    width: "82%",
    height: "28%-2",
    label: " Ops Stream ",
    tags: true,
    border: "line",
    scrollback: 1000,
    wrap: true,
    keys: true,
    mouse: false,
    vi: true,
    scrollbar: {
      ch: " ",
    },
    style: panelStyle(activeTheme, activeTheme.cyanGlow),
  });

  const response = blessed.box({
    parent: screen,
    top: 3,
    left: 0,
    width: "82%",
    height: "64%-1",
    label: " Dialogue ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    wrap: true,
    keys: true,
    mouse: false,
    vi: true,
    padding: {
      left: 1,
      right: 1,
    },
    scrollbar: {
      ch: " ",
    },
    style: panelStyle(activeTheme, activeTheme.magentaGlow),
    content:
      "{gray-fg}Dialogue, streamed replies, and active tool motion will render here.{/}",
  });

  const sidebar = blessed.box({
    parent: screen,
    top: 3,
    left: "82%",
    width: "18%",
    height: "30%",
    label: " Signal Rail ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    wrap: true,
    mouse: false,
    keys: true,
    vi: true,
    padding: {
      left: 1,
      right: 1,
    },
    style: panelStyle(activeTheme, activeTheme.greenGlow),
  });

  const transportBox = blessed.box({
    parent: screen,
    top: 0,
    left: "82%",
    width: "18%",
    height: "0%",
    label: " Transport Mesh ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    wrap: true,
    mouse: false,
    keys: true,
    vi: true,
    padding: {
      left: 1,
      right: 1,
    },
    style: panelStyle(activeTheme, activeTheme.cyanGlow),
    hidden: true,
  });

  const executionBox = blessed.box({
    parent: screen,
    top: 0,
    left: "82%",
    width: "18%",
    height: "0%",
    label: " Execution Deck ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    wrap: true,
    mouse: false,
    keys: true,
    vi: true,
    padding: {
      left: 1,
      right: 1,
    },
    style: panelStyle(activeTheme, activeTheme.greenGlow),
    hidden: true,
  });

  const assistBox = blessed.box({
    parent: screen,
    top: "52%+3",
    left: "82%",
    width: "18%",
    height: "18%-1",
    label: " Control Deck ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    wrap: true,
    mouse: false,
    keys: true,
    vi: true,
    padding: {
      left: 1,
      right: 1,
    },
    style: panelStyle(activeTheme, activeTheme.amberGlow),
  });

  const paletteOverlay = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "72%",
    height: "68%",
    hidden: true,
    tags: true,
    border: "line",
    label: " Command Deck ",
    style: {
      fg: activeTheme.baseFg,
      bg: activeTheme.baseBg,
      border: { fg: activeTheme.magentaGlow },
      label: { fg: activeTheme.magentaGlow, bold: true },
    },
  });

  const paletteInput = blessed.textbox({
    parent: paletteOverlay,
    top: 0,
    left: 0,
    width: "100%-2",
    height: 3,
    inputOnFocus: false,
    border: "line",
    label: " Search ",
    style: {
      border: { fg: activeTheme.amberGlow },
      label: { fg: activeTheme.amberGlow, bold: true },
      focus: {
        border: { fg: activeTheme.primary },
      },
    },
  });

  const paletteList = blessed.list({
    parent: paletteOverlay,
    top: 3,
    left: 0,
    width: "100%-2",
    height: "100%-4",
    border: "line",
    label: " Matches ",
    keys: true,
    mouse: false,
    vi: true,
    tags: true,
    style: {
      border: { fg: activeTheme.cyanGlow },
      selected: {
        bg: activeTheme.primary,
        fg: activeTheme.baseFg,
      },
      item: {
        fg: activeTheme.baseFg,
      },
    },
    items: [],
  });

  const composerOverlay = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "78%",
    height: "72%",
    hidden: true,
    tags: true,
    border: "line",
    label: " Longform Composer ",
    style: {
      fg: activeTheme.baseFg,
      bg: activeTheme.baseBg,
      border: { fg: activeTheme.greenGlow },
      label: { fg: activeTheme.greenGlow, bold: true },
    },
  });

  const composer = blessed.textarea({
    parent: composerOverlay,
    top: 0,
    left: 0,
    width: "100%-2",
    height: "100%-4",
    inputOnFocus: false,
    keys: true,
    mouse: false,
    vi: true,
    border: "line",
    label: " Compose (Ctrl-S submit, Esc close) ",
    style: {
      border: { fg: activeTheme.greenGlow },
      label: { fg: activeTheme.greenGlow, bold: true },
      focus: {
        border: { fg: activeTheme.primary },
      },
    },
  });

  blessed.box({
    parent: composerOverlay,
    bottom: 0,
    left: 1,
    width: "100%-4",
    height: 1,
    tags: true,
    content:
      "{gray-fg}Use this for long prompts, multiline shell commands, and batched research requests.{/}",
  });

  const inputBox = blessed.textbox({
    parent: screen,
    bottom: 1,
    left: 0,
    width: "100%",
    height: 3,
    label: " Transmit / Command ",
    inputOnFocus: false,
    border: "line",
    mouse: false,
    keys: true,
    tags: false,
    style: {
      fg: activeTheme.baseFg,
      bg: activeTheme.baseBg,
      border: { fg: activeTheme.primary },
      label: { fg: activeTheme.primary, bold: true },
      focus: {
        border: { fg: activeTheme.cyanGlow },
      },
    },
  });

  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: {
      fg: activeTheme.baseFg,
      bg: activeTheme.baseBg,
    },
  });

  // Minimum usable terminal dimensions.
  const MIN_COLS = 80;
  const MIN_ROWS = 24;

  if (
    (screen.width as number) < MIN_COLS ||
    (screen.height as number) < MIN_ROWS
  ) {
    screen.destroy();
    output.write(
      `Terminal too small (${screen.width as number}×${screen.height as number}). ` +
        `Minimum required: ${MIN_COLS}×${MIN_ROWS}. Falling back to plain CLI.\n`,
    );
    await startPlainCli(context);
    return "exited";
  }

  let screenDestroyed = false;
  let busy = false;
  let queueDepth = 0;
  let opsCollapsed = true;
  let controlDeckMode: ControlDeckMode = "assist";
  let paletteSelectionIndex = 0;
  let composerOpen = false;
  let activeTurnAbortController: AbortController | null = null;
  const commandHistory: string[] = [];
  let historyIndex = 0;
  const pendingCommands: string[] = [];
  let paletteOpen = false;
  const responseHistory: ResponseTranscriptEntry[] = [];
  let liveResponse: ResponseTranscriptEntry | undefined;
  let liveToolTrail: string[] = [];
  const crashLogPath = join(context.config.dataDir, "cli-crash.log");
  mkdirSync(context.config.dataDir, { recursive: true });
  appendCliTrace(crashLogPath, "tui:start");
  const transcriptExportPath = join(
    context.config.dataDir,
    "latest-transcript.txt",
  );
  const focusables: blessed.Widgets.BlessedElement[] = [
    activity,
    response,
    sidebar,
    assistBox,
    inputBox,
  ];
  let focusIndex = focusables.length - 1;
  let shuttingDown = false;
  let busyFrameIndex = 0;
  let busySpinnerTimer: ReturnType<typeof setInterval> | null = null;
  let deferredForeignRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTextEntryAt = 0;
  let lastPanelFailureSignature = "";
  const deferredForeignActivity: Array<{
    kind: string;
    message: string;
    tone: CliExecutionResult["tone"];
  }> = [];
  const logFatal = (label: string, error: unknown) => {
    const detail =
      error instanceof Error ? error.stack || error.message : String(error);
    try {
      appendFileSync(
        crashLogPath,
        `[${new Date().toISOString()}] ${label}\n${detail}\n\n`,
        "utf8",
      );
    } catch {
      // Best effort only.
    }
    if (!screenDestroyed) {
      pushResponseEntry(label, `Error: ${detail}`);
      appendActivity("err", truncate(detail, 260), "error");
    } else {
      output.write(`\n${label}: ${detail}\nCrash log: ${crashLogPath}\n`);
    }
  };
  let footerHint = "Esc input";
  let busyFrames = activeTheme.busyFrames;

  function isEntryReading(entry: InteractiveTextEntry): boolean {
    return entry._reading === true;
  }

  function activateTextEntry(entry: InteractiveTextEntry): void {
    if (!isEntryReading(entry)) {
      entry.readInput?.();
    }
    entry.focus();
    noteTextEntryActivity();
  }

  function deactivateTextEntry(entry: InteractiveTextEntry): void {
    if (isEntryReading(entry)) {
      entry.cancel?.();
    }
  }

  function textEntryFocused(): boolean {
    return (
      screen.focused === inputBox ||
      screen.focused === composer ||
      screen.focused === paletteInput
    );
  }

  function noteTextEntryActivity(): void {
    lastTextEntryAt = Date.now();
  }

  function textEntryRecentlyActive(): boolean {
    return Date.now() - lastTextEntryAt < 180;
  }

  function shouldDeferForeignActivity(): boolean {
    return (
      busy ||
      textEntryFocused() ||
      textEntryRecentlyActive() ||
      paletteOpen ||
      composerOpen
    );
  }

  function syncFocusIndexFromCurrentFocus(): void {
    const current = screen.focused
      ? focusables.indexOf(screen.focused as blessed.Widgets.BlessedElement)
      : -1;
    if (current >= 0) {
      focusIndex = current;
    }
  }

  function focusPrimaryInput(): void {
    focusIndex = focusables.length - 1;
    activateTextEntry(inputBox as InteractiveTextEntry);
    screen.render();
  }

  function focusProcessingSurface(): void {
    deactivateTextEntry(inputBox as InteractiveTextEntry);
    response.focus();
    updateFooterHint();
    screen.render();
  }

  function footerHintForCurrentFocus(): string {
    if (composerOpen) {
      return macAwareKeyLabel("Ctrl-S submit draft");
    }
    if (paletteOpen) {
      return screen.focused === paletteList
        ? "Enter run selected"
        : "Enter search top match";
    }
    if (screen.focused === inputBox) {
      return "Enter send  ↑/↓ history";
    }
    if (screen.focused === response) {
      return macAwareKeyLabel("PgUp/PgDn scroll conversation");
    }
    if (screen.focused === activity) {
      return macAwareKeyLabel("PgUp/PgDn scroll ops log");
    }
    if (screen.focused === sidebar) {
      return "Enter sessions";
    }
    if (screen.focused === assistBox) {
      return controlDeckMode === "assist"
        ? "Enter top suggestion"
        : controlDeckMode === "gateway"
          ? "Enter gateway supervision"
          : controlDeckMode === "ecosystem"
            ? "Enter runtime ecosystem"
            : controlDeckMode === "jobs"
              ? "Enter background jobs"
              : "Enter responses list";
    }
    return "Esc input";
  }

  function updateFooterHint(options?: {
    flushForeign?: boolean;
    render?: boolean;
  }): void {
    if (options?.flushForeign !== false) {
      flushDeferredForeignActivity();
    }
    footerHint = footerHintForCurrentFocus();
    footer.setContent(
      renderFooter(
        context,
        busy,
        queueDepth,
        footerHint,
        busyFrames[busyFrameIndex % busyFrames.length] ?? "•",
      ),
    );
    if (options?.render !== false) {
      screen.render();
    }
  }

  function startBusySpinner(): void {
    if (busySpinnerTimer) {
      return;
    }
    busySpinnerTimer = setInterval(() => {
      busyFrameIndex = (busyFrameIndex + 1) % busyFrames.length;
      updateFooterHint();
    }, 120);
  }

  function stopBusySpinner(): void {
    if (!busySpinnerTimer) {
      return;
    }
    clearInterval(busySpinnerTimer);
    busySpinnerTimer = null;
    busyFrameIndex = 0;
  }

  function scrollFocusedPane(delta: number): void {
    const target =
      screen.focused === response
        ? response
        : screen.focused === sidebar
          ? sidebar
          : screen.focused === assistBox
            ? assistBox
            : activity;
    target.scroll(delta);
    screen.render();
  }

  function pushNotice(
    kind: "context" | "skills" | "status",
    message: string,
  ): void {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }
    const existingIndex = state.notices.findIndex(
      (entry) => entry.kind === kind && entry.message === trimmed,
    );
    if (existingIndex >= 0) {
      state.notices.splice(existingIndex, 1);
    }
    state.notices.unshift({
      kind,
      message: trimmed,
      at: nowStamp(),
    });
    if (state.notices.length > 6) {
      state.notices.splice(6);
    }
  }

  function renderResponsePane(): void {
    const pinnedToBottom =
      screen.focused !== response || response.getScrollPerc() >= 96;
    response.setContent(
      renderResponseTranscript(responseHistory, liveResponse),
    );
    try {
      writeFileSync(
        transcriptExportPath,
        `${renderPlainTranscript(responseHistory, liveResponse)}\n`,
        "utf8",
      );
    } catch {
      // Best effort only.
    }
    if (pinnedToBottom) {
      response.setScrollPerc(100);
    }
  }

  function exportTranscript(): void {
    const transcript = `${renderPlainTranscript(responseHistory, liveResponse)}\n`;
    try {
      writeFileSync(transcriptExportPath, transcript, "utf8");
    } catch (error) {
      appendActivity(
        "copy",
        `Could not write transcript export: ${formatRecoverableProviderError(error)}`,
        "warning",
      );
      scheduleRefreshPanels(0);
      return;
    }

    let copied = false;
    try {
      if (IS_MACOS && typeof Bun.which === "function" && Bun.which("pbcopy")) {
        const result = spawnSync("pbcopy", [], {
          input: transcript,
          stdio: ["pipe", "ignore", "ignore"],
        });
        copied = result.status === 0;
      }
    } catch {
      copied = false;
    }

    const detail = copied
      ? `Transcript copied to clipboard and saved to ${transcriptExportPath}.`
      : `Transcript saved to ${transcriptExportPath}.`;
    pushNotice("status", detail);
    appendActivity("copy", detail, copied ? "success" : "info");
    scheduleRefreshPanels(0);
  }

  function pushResponseEntry(label: string, body: string): void {
    responseHistory.push({
      label,
      body,
      at: nowStamp(),
      kind:
        label === "You"
          ? "user"
          : label === "Shell"
            ? "shell"
            : label === "Command" || label === "Command Result"
              ? "command"
              : label === "Helm Ready"
                ? "system"
                : "assistant",
    });
    if (responseHistory.length > 48) {
      responseHistory.splice(0, responseHistory.length - 48);
    }
    liveToolTrail = [];
    liveResponse = undefined;
    renderResponsePane();
  }

  function pendingRunLabel(baseLabel: string): string {
    const activeRun = context.services.runController.getActive(
      state.activeSessionId,
    );
    if (!busy || !activeRun) {
      return baseLabel;
    }

    const markers: string[] = [activeRun.status];
    if (activeRun.observedActionCount > 0) {
      markers.push(
        `${activeRun.observedActionCount} step${activeRun.observedActionCount === 1 ? "" : "s"}`,
      );
    }
    if (activeRun.activeAction) {
      markers.push(truncate(activeRun.activeAction, 24));
    } else if (
      activeRun.activeStream &&
      activeRun.activeStream !== "assistant"
    ) {
      markers.push(truncate(activeRun.activeStream, 24));
    } else if (activeRun.statusDetail) {
      markers.push(truncate(activeRun.statusDetail, 24));
    }

    return `${baseLabel} · ${markers.join(" · ")}`;
  }

  function baseLabelForLiveKind(
    kind: ResponseTranscriptEntry["kind"] | undefined,
  ): string {
    if (kind === "shell") {
      return "Shell";
    }
    if (kind === "command") {
      return "Command Result";
    }
    if (kind === "user") {
      return "You";
    }
    if (kind === "system") {
      return "System";
    }
    return context.config.agentName;
  }

  function setLiveResponse(
    label: string,
    body: string,
    options?: { kind?: ResponseTranscriptEntry["kind"]; pending?: boolean },
  ): void {
    liveResponse = {
      label: options?.pending ? pendingRunLabel(label) : label,
      body: body.trim(),
      at: nowStamp(),
      kind: options?.kind,
      pending: options?.pending,
      liveActivity:
        liveToolTrail.length > 0 ? liveToolTrail.slice(-4) : undefined,
    };
    renderResponsePane();
  }

  function pushLiveToolEvent(detail: string): void {
    const nextLine = decorateLiveActivity(detail);
    if (liveToolTrail.at(-1) === nextLine) {
      return;
    }
    liveToolTrail.push(nextLine);
    if (liveToolTrail.length > 6) {
      liveToolTrail = liveToolTrail.slice(-6);
    }
    if (liveResponse) {
      setLiveResponse(
        baseLabelForLiveKind(liveResponse.kind),
        liveResponse.body,
        {
          kind: liveResponse.kind,
          pending: liveResponse.pending,
        },
      );
    }
  }

  function focusAt(index: number): void {
    syncFocusIndexFromCurrentFocus();
    focusIndex = (index + focusables.length) % focusables.length;
    const nextTarget = focusables[focusIndex];
    if (nextTarget === inputBox) {
      activateTextEntry(inputBox as InteractiveTextEntry);
    } else {
      nextTarget?.focus();
    }
    screen.render();
  }

  function renderPaletteItems(query: string): string[] {
    return suggestCommands(query, 12).map(
      (entry) =>
        `{bold}${entry.command}{/bold} {gray-fg}[${entry.category}]{/}`,
    );
  }

  function openPalette(initialValue = ""): void {
    const preservedValue = composerOpen ? composer.getValue() : initialValue;
    if (composerOpen) {
      closeComposer();
    }
    deactivateTextEntry(inputBox as InteractiveTextEntry);
    paletteOpen = true;
    paletteOverlay.show();
    paletteInput.setValue(preservedValue);
    paletteList.setItems(renderPaletteItems(preservedValue));
    paletteSelectionIndex = 0;
    paletteList.select(0);
    activateTextEntry(paletteInput as InteractiveTextEntry);
    updateFooterHint();
    screen.render();
  }

  function closePalette(): void {
    deactivateTextEntry(paletteInput as InteractiveTextEntry);
    paletteOpen = false;
    paletteOverlay.hide();
    paletteInput.clearValue();
    paletteList.setItems([]);
    focusPrimaryInput();
    updateFooterHint();
  }

  function openComposer(initialValue = ""): void {
    const preservedValue = paletteOpen ? paletteInput.getValue() : initialValue;
    if (paletteOpen) {
      closePalette();
    }
    deactivateTextEntry(inputBox as InteractiveTextEntry);
    composerOpen = true;
    composerOverlay.show();
    composer.setValue(preservedValue);
    activateTextEntry(composer as InteractiveTextEntry);
    updateFooterHint();
    screen.render();
  }

  function closeComposer(): void {
    deactivateTextEntry(composer as InteractiveTextEntry);
    composerOpen = false;
    composerOverlay.hide();
    composer.clearValue();
    focusPrimaryInput();
    updateFooterHint();
  }

  function setInputValue(value: string): void {
    noteTextEntryActivity();
    inputBox.setValue(value);
    if (controlDeckMode === "assist") {
      assistBox.setContent(renderSuggestionsContent(value, activeTheme));
    }
    screen.render();
  }

  function controlDeckLabel(mode: ControlDeckMode): string {
    switch (mode) {
      case "ecosystem":
        return " Control Deck · Ecosystem ";
      case "gateway":
        return " Control Deck · Gateway ";
      case "jobs":
        return " Control Deck · Jobs ";
      case "responses":
        return " Control Deck · Responses ";
      default:
        return " Control Deck · Assist ";
    }
  }

  async function renderControlDeck(mode: ControlDeckMode): Promise<void> {
    assistBox.setLabel(controlDeckLabel(mode));
    if (mode === "ecosystem") {
      assistBox.setContent(await renderEcosystemContent(context));
      return;
    }
    if (mode === "gateway") {
      assistBox.setContent(await renderGatewayOpsContent(context));
      return;
    }
    if (mode === "responses") {
      assistBox.setContent(renderResponsesContent(context));
      return;
    }
    if (mode === "jobs") {
      assistBox.setContent(renderJobsContent(context));
      return;
    }
    assistBox.setContent(
      renderSuggestionsContent(inputBox.getValue(), activeTheme),
    );
  }

  function applyThemeToScreen(theme: TuiThemeProfile): void {
    header.style.fg = theme.baseFg;
    header.style.bg = theme.primary;
    header.setContent(buildHeaderContent(context.config.agentName, theme));

    activity.style = panelStyle(theme, theme.cyanGlow);
    response.style = panelStyle(theme, theme.magentaGlow);
    sidebar.style = panelStyle(theme, theme.greenGlow);
    transportBox.style = panelStyle(theme, theme.cyanGlow);
    executionBox.style = panelStyle(theme, theme.greenGlow);
    assistBox.style = panelStyle(theme, theme.amberGlow);

    paletteOverlay.style.fg = theme.baseFg;
    paletteOverlay.style.bg = theme.baseBg;
    paletteOverlay.style.border = { fg: theme.magentaGlow };
    paletteOverlay.style.label = { fg: theme.magentaGlow, bold: true };

    paletteInput.style.border = { fg: theme.amberGlow };
    paletteInput.style.label = { fg: theme.amberGlow, bold: true };
    paletteInput.style.focus = { border: { fg: theme.primary } };

    paletteList.style.border = { fg: theme.cyanGlow };
    paletteList.style.selected = {
      bg: theme.primary,
      fg: theme.baseFg,
    };
    paletteList.style.item = { fg: theme.baseFg };

    composerOverlay.style.fg = theme.baseFg;
    composerOverlay.style.bg = theme.baseBg;
    composerOverlay.style.border = { fg: theme.greenGlow };
    composerOverlay.style.label = { fg: theme.greenGlow, bold: true };

    composer.style.border = { fg: theme.greenGlow };
    composer.style.label = { fg: theme.greenGlow, bold: true };
    composer.style.focus = { border: { fg: theme.primary } };

    inputBox.style.fg = theme.baseFg;
    inputBox.style.bg = theme.baseBg;
    inputBox.style.border = { fg: theme.primary };
    inputBox.style.label = { fg: theme.primary, bold: true };
    inputBox.style.focus = { border: { fg: theme.cyanGlow } };

    footer.style.fg = theme.baseFg;
    footer.style.bg = theme.baseBg;
  }

  async function syncThemeFromSettings(): Promise<void> {
    const nextTheme = getTuiTheme(context.services.settings.get().ui.theme);
    if (nextTheme.name === activeTheme.name) {
      return;
    }
    activeTheme = nextTheme;
    busyFrames = activeTheme.busyFrames;
    applyThemeToScreen(activeTheme);
    appendActivity(
      "theme",
      `Operator theme switched to ${activeTheme.name}.`,
      "success",
    );
    await refreshPanels();
  }

  function appendActivity(
    kind: string,
    message: string,
    tone: CliExecutionResult["tone"],
  ): void {
    activity.log(
      `{gray-fg}${nowStamp()}{/} ${toneTag(tone)} {gray-fg}${escapeBlessed(asciiActivityBadge(kind))}{/} {bold}${escapeBlessed(kind)}{/bold} ${escapeBlessed(message)}`,
    );
  }

  function scheduleDeferredForeignRefresh(delayMs = 90): void {
    if (deferredForeignRefreshTimer) {
      return;
    }
    deferredForeignRefreshTimer = setTimeout(() => {
      deferredForeignRefreshTimer = null;
      flushDeferredForeignActivity();
      scheduleRefreshPanels(0);
    }, delayMs);
    deferredForeignRefreshTimer.unref?.();
  }

  function flushDeferredForeignActivity(): void {
    if (shouldDeferForeignActivity() || deferredForeignActivity.length === 0) {
      return;
    }

    for (const entry of deferredForeignActivity.splice(
      0,
      deferredForeignActivity.length,
    )) {
      appendActivity(entry.kind, entry.message, entry.tone);
    }
  }

  function routeForeignActivity(
    source: "stdout" | "stderr" | "console",
    text: string,
  ): void {
    const nextEntry = {
      kind:
        source === "stdout" ? "srv+" : source === "stderr" ? "srv!" : "log!",
      message: truncate(text, 220),
      tone: source === "stdout" ? ("info" as const) : ("warning" as const),
    };

    if (shouldDeferForeignActivity()) {
      deferredForeignActivity.push(nextEntry);
      scheduleDeferredForeignRefresh();
      return;
    }

    appendActivity(nextEntry.kind, nextEntry.message, nextEntry.tone);
    scheduleRefreshPanels(0);
  }

  function notePanelFailure(panel: string, error: unknown): void {
    const detail = formatRecoverableProviderError(error);
    const signature = `${panel}:${detail}`;
    if (signature === lastPanelFailureSignature) {
      return;
    }
    lastPanelFailureSignature = signature;
    appendActivity(panel, truncate(detail, 180), "warning");
  }

  const restoreForeignTerminalWrites = (() => {
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    let stdoutBuffer = "";
    let stderrBuffer = "";

    const flushBuffer = (source: "stdout" | "stderr") => {
      const pending = source === "stdout" ? stdoutBuffer : stderrBuffer;
      const sanitized = sanitizeForeignTerminalWrite(pending);
      if (sanitized) {
        appendActivity(
          source === "stdout" ? "srv+" : "srv!",
          truncate(sanitized, 220),
          source === "stdout" ? "info" : "warning",
        );
      }
      if (source === "stdout") {
        stdoutBuffer = "";
      } else {
        stderrBuffer = "";
      }
    };

    const interceptWrite = (
      source: "stdout" | "stderr",
      original: typeof process.stdout.write,
    ) => {
      return (
        chunk: string | Uint8Array,
        encoding?: BufferEncoding | ((error?: Error | null) => void),
        callback?: (error?: Error | null) => void,
      ): boolean => {
        if (screenDestroyed || shuttingDown) {
          return original(chunk as never, encoding as never, callback);
        }

        const text =
          typeof chunk === "string"
            ? chunk
            : Buffer.from(chunk).toString(
                typeof encoding === "string" ? encoding : "utf8",
              );
        const sanitized = sanitizeForeignTerminalWrite(text);

        if (!sanitized) {
          if (typeof encoding === "function") {
            encoding();
          }
          callback?.();
          return true;
        }

        if (source === "stdout") {
          stdoutBuffer += `${sanitized}\n`;
        } else {
          stderrBuffer += `${sanitized}\n`;
        }

        const lines = (source === "stdout" ? stdoutBuffer : stderrBuffer).split(
          /\n/gu,
        );
        const remainder = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          if (shouldSuppressForeignTerminalLine(trimmed)) {
            appendCliTrace(crashLogPath, `tui:suppressed-${source}`, trimmed);
            continue;
          }
          routeForeignActivity(source, trimmed);
        }

        if (source === "stdout") {
          stdoutBuffer = remainder;
        } else {
          stderrBuffer = remainder;
        }
        if (textEntryFocused() || paletteOpen || composerOpen) {
          scheduleDeferredForeignRefresh();
        } else {
          flushDeferredForeignActivity();
          scheduleRefreshPanels(0);
        }

        if (typeof encoding === "function") {
          encoding();
        }
        callback?.();
        return true;
      };
    };

    process.stdout.write = interceptWrite(
      "stdout",
      originalStdoutWrite,
    ) as typeof process.stdout.write;
    process.stderr.write = interceptWrite(
      "stderr",
      originalStderrWrite,
    ) as typeof process.stderr.write;

    return () => {
      process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
      process.stderr.write = originalStderrWrite as typeof process.stderr.write;
      flushBuffer("stdout");
      flushBuffer("stderr");
    };
  })();
  unsubscribers.push(restoreForeignTerminalWrites);

  const restoreConsoleWriters = (() => {
    const original = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    };

    const interceptConsole =
      (method: keyof typeof original) =>
      (...args: unknown[]): void => {
        if (screenDestroyed || shuttingDown) {
          original[method](...args);
          return;
        }

        const sanitized = sanitizeForeignTerminalWrite(
          formatForeignTerminalArgs(args),
        );
        if (!sanitized || shouldSuppressForeignTerminalLine(sanitized)) {
          return;
        }

        routeForeignActivity("console", sanitized);
      };

    console.log = interceptConsole("log");
    console.info = interceptConsole("info");
    console.warn = interceptConsole("warn");
    console.error = interceptConsole("error");

    return () => {
      console.log = original.log;
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
    };
  })();
  unsubscribers.push(restoreConsoleWriters);

  async function refreshPanels(): Promise<void> {
    appendCliTrace(crashLogPath, "tui:refreshPanels:start");
    try {
      sidebar.setContent(renderStatusContent(context, state));
    } catch (error) {
      notePanelFailure("status", error);
      sidebar.setContent(
        `{bold}Session Rail{/}\n{yellow-fg}Status temporarily unavailable{/}\n\n${escapeBlessed(formatRecoverableProviderError(error))}`,
      );
    }
    if (!transportBox.hidden) {
      try {
        transportBox.setContent(await renderTransportContent(context));
      } catch (error) {
        notePanelFailure("channels", error);
        transportBox.setContent(
          `{bold}Channels{/}\n{yellow-fg}Transport state unavailable{/}\n\n${escapeBlessed(formatRecoverableProviderError(error))}`,
        );
      }
    }
    if (!executionBox.hidden) {
      try {
        executionBox.setContent(await renderExecutionContent(context));
      } catch (error) {
        notePanelFailure("workbench", error);
        executionBox.setContent(
          `{bold}Workbench{/}\n{yellow-fg}Execution state unavailable{/}\n\n${escapeBlessed(formatRecoverableProviderError(error))}`,
        );
      }
    }
    try {
      await renderControlDeck(controlDeckMode);
    } catch (error) {
      notePanelFailure("launchpad", error);
      assistBox.setContent(
        `{bold}Launchpad{/}\n{yellow-fg}Control deck unavailable{/}\n\n${escapeBlessed(formatRecoverableProviderError(error))}`,
      );
    }
    footer.setContent(
      renderFooter(
        context,
        busy,
        queueDepth,
        footerHint,
        busyFrames[busyFrameIndex % busyFrames.length] ?? "•",
      ),
    );
    screen.render();
    appendCliTrace(
      crashLogPath,
      "tui:refreshPanels:rendered",
      `renders=${String((screen as blessed.Widgets.Screen & { renders?: number }).renders ?? "n/a")} width=${String(screen.width)} height=${String(screen.height)}`,
    );
  }

  let refreshPanelsPromise: Promise<void> | null = null;
  let refreshPanelsQueued = false;
  let refreshPanelsTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleRefreshPanels(delayMs = 120): void {
    refreshPanelsQueued = true;
    if (refreshPanelsTimer) {
      return;
    }
    refreshPanelsTimer = setTimeout(() => {
      refreshPanelsTimer = null;
      if (refreshPanelsPromise) {
        return;
      }
      refreshPanelsPromise = (async () => {
        do {
          refreshPanelsQueued = false;
          await refreshPanels();
        } while (refreshPanelsQueued);
      })().finally(() => {
        refreshPanelsPromise = null;
        if (refreshPanelsQueued && !refreshPanelsTimer) {
          scheduleRefreshPanels(delayMs);
        }
      });
    }, delayMs);
  }

  function syncLayout(): void {
    applyLayout(
      screen,
      {
        header,
        activity,
        response,
        sidebar,
        transportBox,
        executionBox,
        assistBox,
        paletteOverlay,
        paletteInput,
        paletteList,
        composerOverlay,
        composer,
        inputBox,
        footer,
      },
      { opsCollapsed },
    );
    activity.setLabel(
      opsCollapsed ? " Ops Stream " : " Ops Stream · Expanded ",
    );
    screen.render();
  }

  async function processQueue(): Promise<void> {
    if (busy || pendingCommands.length === 0) {
      return;
    }

    busy = true;
    startBusySpinner();
    focusProcessingSurface();
    queueDepth = pendingCommands.length;
    await refreshPanels();

    const line = pendingCommands.shift();
    queueDepth = pendingCommands.length;

    if (!line) {
      busy = false;
      await refreshPanels();
      return;
    }

    const isShellCommand = line.startsWith("!");
    appendActivity("cmd", line, "info");
    setLiveResponse(
      isConversationalInput(line)
        ? context.config.agentName
        : line.startsWith("!")
          ? "Shell"
          : "Command Result",
      "",
      {
        kind: isConversationalInput(line)
          ? "assistant"
          : line.startsWith("!")
            ? "shell"
            : "command",
        pending: true,
      },
    );

    try {
      activeTurnAbortController = new AbortController();
      const result = await executeCliInput(line, context, state, {
        abortSignal: activeTurnAbortController.signal,
        onStream: ({ source, chunk, command }) => {
          const lines = chunk
            .split(/\r?\n/gu)
            .map((entry) => entry.trim())
            .filter(Boolean);
          if (!lines.length) {
            return;
          }
          for (const lineChunk of lines) {
            if (!isShellCommand) {
              appendActivity(
                source === "stdout" ? "out+" : "err+",
                truncate(`${command}: ${lineChunk}`, 260),
                source === "stdout" ? "agent" : "warning",
              );
            }
          }
          const streamed = lines.join("\n");
          const current = liveResponse?.body ?? "";
          setLiveResponse(
            `Running ${command}`,
            current.trim()
              ? `${current}\n${source.toUpperCase()}: ${streamed}`
              : `${source.toUpperCase()}: ${streamed}`,
            { kind: "shell", pending: true },
          );
        },
        onResponseProgress: ({ response }) => {
          setLiveResponse(
            isConversationalInput(line)
              ? context.config.agentName
              : line.startsWith("!")
                ? "Shell"
                : "Command Result",
            response,
            {
              kind: isConversationalInput(line)
                ? "assistant"
                : line.startsWith("!")
                  ? "shell"
                  : "command",
              pending: true,
            },
          );
        },
        onNotice: ({ kind, message }) => {
          pushNotice(kind, message);
          scheduleRefreshPanels(0);
        },
      });
      await syncThemeFromSettings();
      if (result.text) {
        const label =
          result.tone === "agent"
            ? context.config.agentName
            : line.startsWith("!")
              ? "Shell"
              : line.startsWith("/")
                ? "Command Result"
                : context.config.agentName;
        pushResponseEntry(label, result.text);
        if (result.tone !== "agent") {
          appendActivity("out", compactPreview(result.text), result.tone);
        }
      }
      if (result.shouldExit) {
        screen.destroy();
        return;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      try {
        appendFileSync(
          crashLogPath,
          `[${new Date().toISOString()}] command-error ${line}\n${error instanceof Error ? error.stack || error.message : detail}\n\n`,
          "utf8",
        );
      } catch {
        // Best effort only.
      }
      pushResponseEntry(line, `Error: ${detail}`);
      appendActivity("err", detail, "error");
    } finally {
      activeTurnAbortController = null;
      busy = false;
      stopBusySpinner();
      if (!screenDestroyed) {
        try {
          flushDeferredForeignActivity();
          await refreshPanels();
          inputBox.clearValue();
          if (controlDeckMode === "assist") {
            assistBox.setContent(renderSuggestionsContent("", activeTheme));
          }
          activateTextEntry(inputBox as InteractiveTextEntry);
          updateFooterHint();
          screen.render();
        } catch (error) {
          logFatal("renderFailure", error);
          if (!screenDestroyed) {
            screen.destroy();
          }
          output.write(
            `\nEliza Agent TUI could not recover. Crash log: ${crashLogPath}\n`,
          );
          process.exit(1);
        }
        void processQueue();
      }
    }
  }

  function queueCommand(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      inputBox.clearValue();
      activateTextEntry(inputBox as InteractiveTextEntry);
      screen.render();
      return;
    }

    if (
      commandHistory.length === 0 ||
      commandHistory[commandHistory.length - 1] !== trimmed
    ) {
      commandHistory.push(trimmed);
    }
    historyIndex = commandHistory.length;
    if (isConversationalInput(trimmed)) {
      pushResponseEntry("You", trimmed);
    } else if (trimmed.startsWith("!")) {
      pushResponseEntry("Shell", trimmed);
    } else if (trimmed.startsWith("/")) {
      pushResponseEntry("Command", trimmed);
    }
    pendingCommands.push(trimmed);
    queueDepth = pendingCommands.length;
    inputBox.clearValue();
    if (controlDeckMode === "assist") {
      assistBox.setContent(renderSuggestionsContent("", activeTheme));
    }
    screen.render();
    void processQueue();
  }

  inputBox.on("submit", (value) => {
    queueCommand(value);
  });

  inputBox.key("up", () => {
    if (!commandHistory.length) {
      return;
    }
    historyIndex = Math.max(0, historyIndex - 1);
    setInputValue(commandHistory[historyIndex] ?? "");
  });

  inputBox.key("down", () => {
    if (!commandHistory.length) {
      return;
    }
    historyIndex = Math.min(commandHistory.length, historyIndex + 1);
    setInputValue(commandHistory[historyIndex] ?? "");
  });

  inputBox.key("C-p", () => {
    if (!commandHistory.length) {
      return;
    }
    historyIndex = Math.max(0, historyIndex - 1);
    setInputValue(commandHistory[historyIndex] ?? "");
  });

  inputBox.key("C-n", () => {
    if (!commandHistory.length) {
      return;
    }
    historyIndex = Math.min(commandHistory.length, historyIndex + 1);
    setInputValue(commandHistory[historyIndex] ?? "");
  });

  inputBox.key("tab", () => {
    const suggestion = suggestCommands(inputBox.getValue(), 1)[0];
    if (!suggestion) {
      return;
    }
    setInputValue(suggestion.command);
  });

  inputBox.on("keypress", () => {
    noteTextEntryActivity();
    if (controlDeckMode === "assist") {
      assistBox.setContent(
        renderSuggestionsContent(inputBox.getValue(), activeTheme),
      );
      updateFooterHint({ flushForeign: false, render: false });
      screen.render();
    }
  });

  composer.key("C-s", () => {
    const value = composer.getValue();
    closeComposer();
    queueCommand(value);
  });

  composer.key("escape", () => {
    closeComposer();
  });

  paletteInput.on("keypress", () => {
    noteTextEntryActivity();
    const query = paletteInput.getValue();
    paletteList.setItems(renderPaletteItems(query));
    paletteSelectionIndex = 0;
    paletteList.select(0);
    updateFooterHint({ flushForeign: false });
    screen.render();
  });

  paletteInput.key("enter", () => {
    const selected = suggestCommands(paletteInput.getValue(), 1)[0];
    if (!selected) {
      return;
    }
    closePalette();
    queueCommand(selected.command);
  });

  paletteList.key("enter", () => {
    const selected = suggestCommands(paletteInput.getValue(), 12)[
      paletteSelectionIndex
    ];
    if (!selected) {
      return;
    }
    closePalette();
    queueCommand(selected.command);
  });

  // Track the highlighted index as the user navigates — do NOT execute here.
  // "select item" fires on every highlight change (arrow keys, mouse hover),
  // so executing on this event would run commands during navigation.
  // Execution is handled exclusively by the "enter" key handlers above.
  paletteList.on("select item", (_, index) => {
    paletteSelectionIndex = index;
  });
  for (const key of ["up", "down", "j", "k", "C-p", "C-n"]) {
    paletteList.key(key, () => {
      const suggestions = suggestCommands(paletteInput.getValue(), 12);
      const current = suggestions[paletteSelectionIndex];
      if (!current) {
        paletteSelectionIndex = 0;
        paletteList.select(0);
        updateFooterHint();
        screen.render();
        return;
      }
      const nextIndex =
        key === "up" || key === "k" || key === "C-p"
          ? Math.max(0, paletteSelectionIndex - 1)
          : Math.min(suggestions.length - 1, paletteSelectionIndex + 1);
      paletteSelectionIndex = nextIndex;
      paletteList.select(nextIndex);
      updateFooterHint();
      screen.render();
    });
  }

  const exitCli = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (!screenDestroyed) {
      screen.destroy();
    }
    setTimeout(() => {
      process.exit(0);
    }, 0);
  };

  const requestActiveTurnCancellation = (): boolean => {
    if (
      !activeTurnAbortController ||
      activeTurnAbortController.signal.aborted
    ) {
      return false;
    }
    activeTurnAbortController.abort();
    appendActivity(
      "stop",
      "Cancellation requested for the active turn.",
      "warning",
    );
    pushNotice(
      "status",
      "Cancellation requested. Waiting for the current turn to stop.",
    );
    scheduleRefreshPanels(0);
    return true;
  };

  const forceTerminateCli = (signal: string) => {
    if (shuttingDown) {
      process.exit(signal === "SIGINT" ? 130 : 0);
    }
    shuttingDown = true;
    if (!screenDestroyed) {
      screen.destroy();
    }
    output.write(
      `\n${context.config.agentName} received ${signal}. Exiting.\n`,
    );
    process.exit(signal === "SIGINT" ? 130 : 0);
  };

  const handleUncaughtException = (error: unknown) => {
    if (shuttingDown && isBenignCliShutdownError(error)) {
      return;
    }
    if (!screenDestroyed && isRecoverableProviderError(error)) {
      logFatal("recoverableRuntimeError", error);
      stopBusySpinner();
      busy = false;
      const detail = formatRecoverableProviderError(error);
      appendActivity("runtime", detail, "error");
      pushResponseEntry(context.config.agentName, `Error: ${detail}`);
      liveResponse = undefined;
      scheduleRefreshPanels(0);
      return;
    }
    logFatal("uncaughtException", error);
    if (!screenDestroyed) {
      screen.destroy();
    }
    output.write(`\nA fatal CLI error occurred. Crash log: ${crashLogPath}\n`);
    process.exit(1);
  };

  const handleUnhandledRejection = (error: unknown) => {
    if (shuttingDown && isBenignCliShutdownError(error)) {
      return;
    }
    if (!screenDestroyed && isRecoverableProviderError(error)) {
      logFatal("recoverableRuntimeRejection", error);
      stopBusySpinner();
      busy = false;
      const detail = formatRecoverableProviderError(error);
      appendActivity("runtime", detail, "error");
      pushResponseEntry(context.config.agentName, `Error: ${detail}`);
      liveResponse = undefined;
      scheduleRefreshPanels(0);
      return;
    }
    logFatal("unhandledRejection", error);
    if (!screenDestroyed) {
      screen.destroy();
    }
    output.write(
      `\nA fatal CLI rejection occurred. Crash log: ${crashLogPath}\n`,
    );
    process.exit(1);
  };

  const handleSigint = () => {
    if (requestActiveTurnCancellation()) {
      return;
    }
    forceTerminateCli("SIGINT");
  };
  const handleSigterm = () => {
    forceTerminateCli("SIGTERM");
  };
  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);
  process.once("uncaughtException", handleUncaughtException);
  process.once("unhandledRejection", handleUnhandledRejection);
  screen.key(["C-q"], () => {
    exitCli();
  });
  screen.key(["C-c"], () => {
    if (requestActiveTurnCancellation()) {
      return;
    }
    exitCli();
  });
  screen.key(["q"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    exitCli();
  });
  screen.key(["C-p"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    openPalette(inputBox.getValue());
  });
  screen.key(["C-g"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    controlDeckMode = "gateway";
    void refreshPanels();
  });
  screen.key(["C-b"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    controlDeckMode = "jobs";
    void refreshPanels();
  });
  screen.key(["C-e"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    openComposer(inputBox.getValue());
  });
  screen.key(["C-s"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    response.focus();
    screen.render();
  });
  screen.key(["C-t"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    queueCommand(canonicalizeSlashCommandSyntax("/theme next"));
  });
  screen.key(["C-y"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    queueCommand(canonicalizeSlashCommandSyntax("/theme prev"));
  });
  screen.key(["tab"], () => {
    if (composerOpen) {
      return;
    }
    if (screen.focused === inputBox) {
      return;
    }
    if (paletteOpen) {
      deactivateTextEntry(paletteInput as InteractiveTextEntry);
      paletteList.focus();
      updateFooterHint();
      screen.render();
      return;
    }
    syncFocusIndexFromCurrentFocus();
    focusAt(focusIndex + 1);
  });
  screen.key(["S-tab"], () => {
    if (composerOpen) {
      return;
    }
    if (screen.focused === inputBox) {
      return;
    }
    if (paletteOpen) {
      activateTextEntry(paletteInput as InteractiveTextEntry);
      updateFooterHint();
      screen.render();
      return;
    }
    syncFocusIndexFromCurrentFocus();
    focusAt(focusIndex - 1);
  });
  screen.key(["escape"], () => {
    if (composerOpen) {
      closeComposer();
      return;
    }
    if (paletteOpen) {
      closePalette();
      return;
    }
    activateTextEntry(inputBox as InteractiveTextEntry);
    updateFooterHint();
    screen.render();
  });
  screen.key(["C-l"], () => {
    activity.setContent("");
    responseHistory.length = 0;
    liveResponse = undefined;
    renderResponsePane();
    screen.render();
  });
  screen.key(["C-x"], () => {
    exportTranscript();
  });
  screen.key(["C-r"], () => {
    void refreshPanels();
  });
  screen.key(["C-o"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    opsCollapsed = !opsCollapsed;
    syncLayout();
    updateFooterHint();
  });
  screen.key(["M-1"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    controlDeckMode = "assist";
    void refreshPanels();
  });
  screen.key(["M-2"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    controlDeckMode = "ecosystem";
    void refreshPanels();
  });
  screen.key(["M-3"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    controlDeckMode = "gateway";
    void refreshPanels();
  });
  screen.key(["M-4"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    controlDeckMode = "responses";
    void refreshPanels();
  });
  screen.key(["M-5"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    controlDeckMode = "jobs";
    void refreshPanels();
  });
  screen.key(["pageup"], () => {
    scrollFocusedPane(-8);
  });
  screen.key(["pagedown"], () => {
    scrollFocusedPane(8);
  });
  screen.key(["C-u"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    scrollFocusedPane(-8);
  });
  screen.key(["C-d"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    scrollFocusedPane(8);
  });
  screen.key(["enter"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    if (screen.focused === sidebar) {
      queueCommand(canonicalizeSlashCommandSyntax("/sessions list"));
      return;
    }
    if (screen.focused === assistBox) {
      if (controlDeckMode === "assist") {
        const suggestion = suggestCommands(inputBox.getValue(), 1)[0];
        if (suggestion) {
          queueCommand(suggestion.command);
        }
        return;
      }
      if (controlDeckMode === "ecosystem") {
        queueCommand(canonicalizeSlashCommandSyntax("/runtime ecosystem"));
        return;
      }
      if (controlDeckMode === "gateway") {
        queueCommand(canonicalizeSlashCommandSyntax("/gateway supervision"));
        return;
      }
      if (controlDeckMode === "jobs") {
        queueCommand(canonicalizeSlashCommandSyntax("/jobs"));
        return;
      }
      queueCommand(canonicalizeSlashCommandSyntax("/responses list"));
    }
  });

  const hotkeys: Array<[string[], string]> = [
    [["f2"], "/status"],
    [["f3"], canonicalizeSlashCommandSyntax("/tools summary")],
    [["f4"], canonicalizeSlashCommandSyntax("/delegate overview")],
    [["f5"], canonicalizeSlashCommandSyntax("/gateway readiness")],
    [["f6"], canonicalizeSlashCommandSyntax("/sessions list")],
    [["f7"], "/doctor"],
    [["f8"], canonicalizeSlashCommandSyntax("/runtime plugins")],
    [["f9"], canonicalizeSlashCommandSyntax("/runtime ecosystem")],
    [["f10"], canonicalizeSlashCommandSyntax("/gateway history limit:10")],
    [["f11"], canonicalizeSlashCommandSyntax("/gateway supervision")],
    [["f12"], canonicalizeSlashCommandSyntax("/responses list")],
  ];

  for (const [keys, command] of hotkeys) {
    screen.key(keys, () => {
      if (textEntryFocused() || paletteOpen || composerOpen) {
        return;
      }
      queueCommand(command);
    });
  }

  screen.on("resize", () => {
    if (
      (screen.width as number) < MIN_COLS ||
      (screen.height as number) < MIN_ROWS
    ) {
      appendActivity(
        "warn",
        `Terminal too small (${screen.width as number}×${screen.height as number}). Resize to at least ${MIN_COLS}×${MIN_ROWS}.`,
        "warning",
      );
      screen.render();
      return;
    }
    syncLayout();
    scheduleRefreshPanels(0);
  });

  screen.on("warning", (warning) => {
    appendActivity("warn", truncate(String(warning), 160), "warning");
    footerHint = "Check warning in activity";
    void refreshPanels();
  });

  for (const element of [
    activity,
    response,
    sidebar,
    assistBox,
    paletteInput,
    paletteList,
    composer,
    inputBox,
  ]) {
    element.on("focus", () => {
      if (
        element === inputBox ||
        element === composer ||
        element === paletteInput
      ) {
        noteTextEntryActivity();
      }
      updateFooterHint();
    });
    element.on("click", () => {
      if (
        element === inputBox ||
        element === composer ||
        element === paletteInput
      ) {
        noteTextEntryActivity();
      }
      updateFooterHint();
    });
  }

  unsubscribers.push(
    context.gateway.onUpdate((event) => {
      appendActivity(
        event.platform === "gateway" ? "gw" : event.platform,
        truncate(event.detail, 160),
        event.kind === "reject" ? "warning" : "info",
      );
      scheduleRefreshPanels();
    }),
  );
  unsubscribers.push(
    context.services.terminal.onUpdate((event) => {
      if (busy) {
        appendActivity(
          "exec",
          `${event.detail} → ${event.exitCode}`,
          event.exitCode === 0 ? "success" : "warning",
        );
        pushLiveToolEvent(
          `shell ${truncate(event.detail, 64)} → ${event.exitCode}`,
        );
        scheduleRefreshPanels();
        return;
      }
      appendActivity(
        "exec",
        `${event.detail} → ${event.exitCode}`,
        event.exitCode === 0 ? "success" : "warning",
      );
      scheduleRefreshPanels();
    }),
  );
  unsubscribers.push(
    context.services.delegation.onUpdate((event) => {
      appendActivity("task", truncate(event.detail, 160), "info");
      if (busy) {
        pushLiveToolEvent(`delegate ${truncate(event.detail, 72)}`);
      }
      scheduleRefreshPanels();
    }),
  );
  unsubscribers.push(
    context.services.runController.onUpdate((event) => {
      if (event.sessionId !== state.activeSessionId) {
        scheduleRefreshPanels();
        return;
      }
      if (event.type === "approvals" && event.run.pendingApprovals > 0) {
        pushNotice(
          "status",
          `Pending execution approvals: ${event.run.pendingApprovals}`,
        );
      }
      if (!shouldRenderRunEvent(event.run.progressMode, event)) {
        scheduleRefreshPanels();
        return;
      }
      const detail = formatRunEvent(event);
      if (!detail) {
        scheduleRefreshPanels();
        return;
      }
      if (busy) {
        if (
          event.type === "action-started" ||
          event.type === "action-completed" ||
          event.type === "approvals" ||
          event.type === "error" ||
          (event.type === "stream" && event.run.activeStream !== "assistant")
        ) {
          pushLiveToolEvent(detail);
        }
        if (liveResponse?.pending) {
          setLiveResponse(
            baseLabelForLiveKind(liveResponse.kind),
            liveResponse.body,
            {
              kind: liveResponse.kind,
              pending: true,
            },
          );
        }
        if (
          event.type === "completed" ||
          event.type === "error" ||
          event.type === "approvals"
        ) {
          appendActivity(
            "run",
            truncate(detail, 160),
            event.type === "error"
              ? "warning"
              : event.type === "completed"
                ? "success"
                : "info",
          );
        }
      } else {
        appendActivity(
          "run",
          truncate(detail, 160),
          event.type === "error"
            ? "warning"
            : event.type === "completed"
              ? "success"
              : "info",
        );
      }
      scheduleRefreshPanels(0);
    }),
  );
  unsubscribers.push(
    context.services.startupState.onUpdate(() => {
      scheduleRefreshPanels(0);
    }),
  );
  unsubscribers.push(
    context.services.sessions.onActivity((event) => {
      if (
        event.sessionId === state.activeSessionId &&
        (event.role === "user" || event.role === "assistant")
      ) {
        return;
      }
      appendActivity("mem", truncate(event.detail, 160), "agent");
      scheduleRefreshPanels();
    }),
  );
  unsubscribers.push(
    context.services.apiTransport.onUpdate((event) => {
      appendActivity(
        "api",
        `${event.record.id} ${truncate(event.record.outputText, 120)}`,
        "agent",
      );
      scheduleRefreshPanels();
    }),
  );

  appendActivity(
    "boot",
    `${context.config.agentName} cockpit online. Type /help for shortcuts, or stay in the plain shell for everyday paired work.`,
    "success",
  );
  appendActivity(
    "tip",
    `Use ${macAwareKeyLabel("Ctrl-E")} for longform drafts, start a shell action with !, and use ${canonicalizeSlashCommandSyntax("/theme list")} to shift the operator palette.`,
    "info",
  );
  for (const entry of options?.bootLogs ?? []) {
    appendActivity(
      entry.source === "stderr" ? "boot!" : "boot+",
      truncate(entry.text, 180),
      entry.source === "stderr" ? "warning" : "info",
    );
  }
  pushResponseEntry(
    "Helm Ready",
    `You are live in the Eliza Agent cockpit.\n\nStay here when you want dialogue plus observability, task supervision, and transport state. Drop back to the plain shell when you want the fastest daily coding loop.\n\nTalk to me normally, run !git status, or check ${canonicalizeSlashCommandSyntax("/status")}, ${canonicalizeSlashCommandSyntax("/mode")}, ${canonicalizeSlashCommandSyntax("/progress")}, ${canonicalizeSlashCommandSyntax("/accounts")}, or ${canonicalizeSlashCommandSyntax("/gateway readiness")}.`,
  );
  if (!transportBox.hidden) {
    transportBox.setContent(await renderTransportContent(context));
  }
  if (!executionBox.hidden) {
    executionBox.setContent(await renderExecutionContent(context));
  }
  await renderControlDeck(controlDeckMode);

  applyThemeToScreen(activeTheme);
  appendCliTrace(crashLogPath, "tui:before-refresh");
  await refreshPanels();
  appendCliTrace(crashLogPath, "tui:after-refresh");
  syncLayout();
  appendCliTrace(crashLogPath, "tui:after-layout");
  activateTextEntry(inputBox as InteractiveTextEntry);
  updateFooterHint();
  screen.render();
  appendCliTrace(
    crashLogPath,
    "tui:after-final-render",
    `renders=${String((screen as blessed.Widgets.Screen & { renders?: number }).renders ?? "n/a")} focused=${screen.focused?.type ?? "none"}`,
  );
  options?.onReady?.();
  setTimeout(() => {
    void context.ensureDeferredHydration("tui").catch((error) => {
      if (screenDestroyed && isBenignCliShutdownError(error)) {
        return;
      }
      if (isRecoverableProviderError(error)) {
        logFatal("recoverableDeferredHydration", error);
        appendActivity(
          "startup",
          truncate(formatRecoverableProviderError(error), 180),
          "warning",
        );
        pushNotice(
          "status",
          `Deferred startup hit a recoverable error: ${formatRecoverableProviderError(error)}`,
        );
        scheduleRefreshPanels(0);
        return;
      }
      logFatal("deferredHydrationFailure", error);
      appendActivity(
        "startup",
        truncate(formatRecoverableProviderError(error), 180),
        "error",
      );
      pushNotice(
        "status",
        `Deferred startup failed: ${formatRecoverableProviderError(error)}`,
      );
      scheduleRefreshPanels(0);
    });
  }, 25).unref?.();

  return await new Promise<"exited" | "unexpected">((resolve) => {
    // Bun can exit when only Blessed's terminal listeners remain active.
    // Keep one lightweight timer alive for the lifetime of the TUI.
    const tuiKeepAlive = setInterval(() => {}, 60_000);
    screen.on("destroy", () => {
      clearInterval(tuiKeepAlive);
      screenDestroyed = true;
      stopBusySpinner();
      process.removeListener("SIGINT", handleSigint);
      process.removeListener("SIGTERM", handleSigterm);
      process.removeListener("uncaughtException", handleUncaughtException);
      process.removeListener("unhandledRejection", handleUnhandledRejection);
      if (deferredForeignRefreshTimer) {
        clearTimeout(deferredForeignRefreshTimer);
        deferredForeignRefreshTimer = null;
      }
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      if (!shuttingDown) {
        try {
          appendFileSync(
            crashLogPath,
            `[${new Date().toISOString()}] unexpected-screen-destroy\nTUI screen destroyed before an explicit shutdown path.\n\n`,
            "utf8",
          );
        } catch {
          // Best effort only.
        }
      }
      resolve(shuttingDown ? "exited" : "unexpected");
    });
  });
}

export async function startCli(
  context: AppContext,
  options?: StartCliOptions,
): Promise<void> {
  const forcePlain = Bun.argv.includes("--plain-cli");
  const forceCockpit =
    Bun.argv.includes("--cockpit") || Bun.argv.includes("--cli");
  const canUseTui = input.isTTY && output.isTTY && forceCockpit && !forcePlain;

  if (!canUseTui) {
    await startPlainCli(context, options);
    return;
  }

  try {
    const tuiResult = await startTui(context, options);
    if (tuiResult === "unexpected") {
      console.warn(
        `${context.config.agentName} TUI closed unexpectedly. Falling back to plain CLI.`,
      );
      await startPlainCli(context, options);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(
      `${context.config.agentName} TUI failed to start (${detail}). Falling back to plain CLI.`,
    );
    await startPlainCli(context, options);
  }
}
