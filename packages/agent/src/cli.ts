import { appendFileSync, mkdirSync } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import blessed from "blessed";
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
}

type ControlDeckMode = "assist" | "ecosystem" | "gateway" | "responses";

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
}

function nowStamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

// biome-ignore lint/complexity/useRegexLiterals: A constructor keeps control-byte escapes explicit without tripping the control-character lint.
const ANSI_ESCAPE_PATTERN = new RegExp(
  "\\u001B(?:\\[[0-?]*[ -/]*[@-~]|\\][^\\u0007]*(?:\\u0007|\\u001B\\\\))",
  "gu",
);

function sanitizeForeignTerminalWrite(text: string): string {
  return text
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(/\r\n/gu, "\n")
    .replace(/\r/gu, "\n")
    .replaceAll(String.fromCharCode(0), "")
    .trim();
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

function formatRecoverableProviderError(error: unknown): string {
  const detail = getCliErrorMessage(error);
  return detail.length > 280 ? `${detail.slice(0, 277)}...` : detail;
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
        ? "{yellow-fg}You{/}"
        : entry.kind === "assistant"
          ? "{cyan-fg}Agent{/}"
          : entry.kind === "shell"
            ? "{green-fg}Shell{/}"
            : entry.kind === "command"
              ? "{magenta-fg}Command{/}"
              : "{gray-fg}System{/}";
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

    return [
      `{gray-fg}${escapeBlessed(entry.at)}{/} ${roleTag}${customLabel}${entry.pending ? " {gray-fg}…{/}" : ""}`,
      body,
    ].join("\n");
  };

  return sections
    .slice(-20)
    .map((entry) => renderEntry(entry))
    .join("\n\n{gray-fg}────────────────────────────────{/}\n\n");
}

function toneTag(tone: CliExecutionResult["tone"]): string {
  switch (tone) {
    case "success":
      return "{green-fg}OK{/}";
    case "warning":
      return "{yellow-fg}WARN{/}";
    case "error":
      return "{red-fg}ERR{/}";
    case "agent":
      return "{cyan-fg}AI{/}";
    default:
      return "{blue-fg}SYS{/}";
  }
}

function buildHelpText(agentName: string): string {
  const command = (value: string) => canonicalizeSlashCommandSyntax(value);
  return [
    `${agentName} TUI shortcuts`,
    "",
    "Global:",
    `  q / ${macAwareKeyLabel("Ctrl-C")}       Quit`,
    "  Esc              Focus command input",
    `  ${macAwareKeyLabel("Ctrl-L")}           Clear activity feed and response pane`,
    `  ${macAwareKeyLabel("Ctrl-R")}           Refresh status panels`,
    `  ${macAwareKeyLabel("Ctrl-G")}           Switch to Gateway control deck`,
    `  ${macAwareKeyLabel("Ctrl-P")}           Open command palette`,
    `  ${macAwareKeyLabel("Ctrl-E")}           Open multiline composer`,
    `  ${macAwareKeyLabel("Ctrl-S")}           Focus last response`,
    `  ${macAwareKeyLabel("Alt-1..Alt-4")}     Switch control deck mode (Assist/Ecosystem/Gateway/Responses)`,
    "  Tab              Complete the top suggested command",
    `  ${macAwareKeyLabel("PageUp/PageDown")}  Scroll the focused pane`,
    "  Up/Down          Command history in input",
    "  Ctrl-N/Ctrl-P    History + list navigation fallback",
    "  Ctrl-U/Ctrl-D    Scroll focused pane fallback",
    "",
    "Hotkeys:",
    "  F2  /status",
    `  F3  ${command("/tools summary")}`,
    `  F4  ${command("/delegate overview")}`,
    `  F5  ${command("/gateway readiness")}`,
    `  F6  ${command("/sessions list")}`,
    "  F7  /doctor",
    `  F8  ${command("/runtime plugins")}`,
    `  F9  ${command("/runtime ecosystem")}`,
    `  F10 ${command("/gateway history limit:10")}`,
    `  F11 ${command("/gateway supervision")}`,
    `  F12 ${command("/responses list")}`,
    `  Shift-F12 ${command("/runtime transports")}`,
    `  ${macAwareKeyLabel("Ctrl-T")}           Next theme`,
    `  ${macAwareKeyLabel("Ctrl-Y")}           Previous theme`,
    "",
    "Examples:",
    `  ${command("/skills list")}`,
    `  ${command("/execution status")}`,
    `  ${command("/theme list")}`,
    `  ${command("/theme set ghost")}`,
    `  ${command("/theme next")}`,
    `  ${command("/transport inventory")}`,
    `  ${command("/transport show telegram")}`,
    `  ${command("/transport mismatches")}`,
    "  /browser capture https://example.com",
    "  /media analyze ./recordings/demo.wav",
    `  ${command("/delegate create Research spike :: validate a transport path")}`,
    `  ${command("/trajectories ingest gateway label:review limit:100")}`,
    `  ${command("/accounts")}`,
    `  ${command("/accounts doctor")}`,
    `  ${command("/mode")}`,
    `  ${command("/progress")}`,
    `  ${command("/accounts connect codex")}`,
    `  ${command("/accounts connect claude-code")}`,
    "  !git status",
    "  !uname -a",
  ].join("\n");
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
  return `{bold}${agentName}{/bold}  {black-fg}ELIZAOS TERMINAL HELM{/}  {white-fg}${theme.label} · ${theme.name} · native cloud + local specialist models{/}`;
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
): void {
  const width = screen.width as number;
  const height = screen.height as number;
  const compact = width < 140;
  const narrow = width < 110;
  const short = height < 34;

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
    layout.response.height = short ? "42%-1" : "46%-1";

    layout.activity.top = short ? "42%+2" : "46%+2";
    layout.activity.left = 0;
    layout.activity.width = "100%";
    layout.activity.height = short ? "12%" : "14%";

    layout.sidebar.top = short ? "54%+2" : "60%+2";
    layout.sidebar.left = 0;
    layout.sidebar.width = "50%";
    layout.sidebar.height = short ? "15%" : "17%";

    layout.transportBox.top = short ? "54%+2" : "60%+2";
    layout.transportBox.left = "50%";
    layout.transportBox.width = "50%";
    layout.transportBox.height = short ? "15%" : "17%";

    layout.executionBox.top = short ? "69%+2" : "77%+2";
    layout.executionBox.left = 0;
    layout.executionBox.width = "50%";
    layout.executionBox.height = "13%-1";

    layout.assistBox.top = short ? "69%+2" : "77%+2";
    layout.assistBox.left = "50%";
    layout.assistBox.width = "50%";
    layout.assistBox.height = "13%-1";
  } else if (compact) {
    layout.response.top = 3;
    layout.response.left = 0;
    layout.response.width = "76%";
    layout.response.height = short ? "63%-1" : "66%-1";

    layout.activity.top = short ? "63%+2" : "66%+2";
    layout.activity.left = 0;
    layout.activity.width = "76%";
    layout.activity.height = short ? "27%-2" : "24%-2";

    layout.sidebar.top = 3;
    layout.sidebar.left = "76%";
    layout.sidebar.width = "24%";
    layout.sidebar.height = short ? "22%" : "24%";

    layout.transportBox.top = short ? "22%+3" : "24%+3";
    layout.transportBox.left = "76%";
    layout.transportBox.width = "24%";
    layout.transportBox.height = short ? "18%" : "18%";

    layout.executionBox.top = short ? "40%+3" : "42%+3";
    layout.executionBox.left = "76%";
    layout.executionBox.width = "24%";
    layout.executionBox.height = short ? "16%" : "16%";

    layout.assistBox.top = short ? "56%+3" : "58%+3";
    layout.assistBox.left = "76%";
    layout.assistBox.width = "24%";
    layout.assistBox.height = short ? "32%-1" : "32%-1";
  } else {
    layout.response.top = 3;
    layout.response.left = 0;
    layout.response.width = "76%";
    layout.response.height = "66%-1";

    layout.activity.top = "66%+2";
    layout.activity.left = 0;
    layout.activity.width = "76%";
    layout.activity.height = "24%-2";

    layout.sidebar.top = 3;
    layout.sidebar.left = "76%";
    layout.sidebar.width = "24%";
    layout.sidebar.height = short ? "22%" : "24%";

    layout.transportBox.top = short ? "22%+3" : "24%+3";
    layout.transportBox.left = "76%";
    layout.transportBox.width = "24%";
    layout.transportBox.height = short ? "18%" : "18%";

    layout.executionBox.top = short ? "40%+3" : "42%+3";
    layout.executionBox.left = "76%";
    layout.executionBox.width = "24%";
    layout.executionBox.height = short ? "16%" : "16%";

    layout.assistBox.top = short ? "56%+3" : "58%+3";
    layout.assistBox.left = "76%";
    layout.assistBox.width = "24%";
    layout.assistBox.height = short ? "32%-1" : "32%-1";
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
            `- ${trace.platform}:${trace.kind} ${truncate(trace.detail ?? trace.traceId, 34)}`,
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
          (entry) => `- ${entry.platform} ${truncate(entry.textPreview, 32)}`,
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
    "{bold}Execution{/}",
    `Backend: {cyan-fg}${settings.execution.backend}{/}`,
    `Diagnostics: ${canonicalizeSlashCommandSyntax("/execution status")}`,
    "",
    "{bold}Recent Shell{/}",
    ...(recent.length
      ? recent.map(
          (entry) =>
            `- ${entry.backend} ${truncate(
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

function renderSuggestionsContent(inputValue: string): string {
  if (!inputValue.trim()) {
    return [
      "{bold}Launchpad{/}",
      "",
      "{bold}Try This{/}",
      "- summarize this repo and tell me what matters",
      "- what machine am I on and what tools can you use here",
      "- plan the next coding step for this project",
      "",
      "{bold}Shell{/}",
      "- !pwd",
      "- !git status",
      "- !uname -a",
      "",
      "{bold}Operator{/}",
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
    "{bold}Categories{/}",
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

  const runShellFlow = async (
    command: string,
    onSuccess?: () => Promise<string | undefined>,
  ): Promise<CliExecutionResult> => {
    const result = await context.services.terminal.runStreamingLocal(command, {
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
    });
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
    },
  );

  return { text: response, tone: "agent" };
}

interface StartCliOptions {
  onReady?: () => void;
}

async function startPlainCli(
  context: AppContext,
  options?: StartCliOptions,
): Promise<void> {
  const rl = createInterface({ input, output });
  const state: CliState = { activeSessionId: "cli:local-user", notices: [] };
  let closed = false;
  const crashLogPath = join(context.config.dataDir, "cli-crash.log");
  const unsubscribeRunUpdates = context.services.runController.onUpdate(
    (event) => {
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
      output.write(`\n[run] ${detail}\n`);
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

  rl.on("close", () => {
    closed = true;
  });

  output.write(`${context.config.agentName} CLI\n`);
  output.write(
    `Type "exit" to quit. Try /help, /status, ${canonicalizeSlashCommandSyntax("/mode")}, ${canonicalizeSlashCommandSyntax("/progress")}, ${canonicalizeSlashCommandSyntax("/accounts")}, ${canonicalizeSlashCommandSyntax("/accounts doctor")}, ${canonicalizeSlashCommandSyntax("/transport inventory")}, ${canonicalizeSlashCommandSyntax("/transport mismatches")}, ${canonicalizeSlashCommandSyntax("/gateway readiness")}, ${canonicalizeSlashCommandSyntax("/runtime plugins")}, or ${canonicalizeSlashCommandSyntax("/delegate overview")}.\n\n`,
  );
  options?.onReady?.();
  if (input.isTTY && output.isTTY) {
    setTimeout(() => {
      void context.ensureDeferredHydration("plain-cli");
    }, 25).unref?.();
  }
  try {
    while (true) {
      let line = "";
      try {
        line = (await rl.question("> ")).trim();
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

      try {
        const result = await executeCliInput(line, context, state);
        if (result.text) {
          output.write(`\n${result.text}\n\n`);
        }
        if (!input.isTTY) {
          break;
        }
        if (result.shouldExit) {
          break;
        }
      } catch (error) {
        output.write(`\nError: ${getCliErrorMessage(error)}\n\n`);
      }
    }
  } finally {
    if (!closed) {
      rl.close();
    }
    unsubscribeRunUpdates();
    process.removeListener("uncaughtException", handleUncaughtException);
    process.removeListener("unhandledRejection", handleUnhandledRejection);
    if (!input.isTTY) {
      process.exit(0);
    }
  }
}

function renderStatusContent(context: AppContext, state: CliState): string {
  const settings = context.services.settings.get();
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
    "{bold}Runtime{/}",
    `Provider: {cyan-fg}${settings.model.provider}{/}`,
    `Model: {cyan-fg}${settings.model.model}{/}`,
    `Connection: {cyan-fg}${escapeBlessed(autonomousControl.alignment.connection.kind)}{/}${autonomousControl.alignment.connection.provider ? ` via {cyan-fg}${escapeBlessed(autonomousControl.alignment.connection.provider)}{/}` : ""}`,
    `Startup: {yellow-fg}${startup.hotPathReady ? "hot-ready" : "warming"}{/} deferred={yellow-fg}${startup.deferredReady ? "ready" : "warming"}{/}`,
    `Fallback: {yellow-fg}${context.config.offlineBootstrapMode ? "offline-bootstrap" : "disabled"}{/}`,
    `Theme: {yellow-fg}${settings.ui.theme}{/}`,
    `Run: {yellow-fg}${settings.agent.runDepth}{/} cap={yellow-fg}${settings.agent.maxIterations}{/} progress={yellow-fg}${settings.agent.toolProgressMode}{/}`,
    activeRun
      ? `Observed: {green-fg}${activeRun.status}{/} steps={green-fg}${activeRun.observedActionCount}{/}${activeRun.activeAction ? ` action={cyan-fg}${escapeBlessed(truncate(activeRun.activeAction, 26))}{/}` : ""}${activeRun.activeStream ? ` stream={magenta-fg}${escapeBlessed(activeRun.activeStream)}{/}` : ""}${activeRun.statusDetail && !activeRun.activeAction ? ` detail={gray-fg}${escapeBlessed(truncate(activeRun.statusDetail, 26))}{/}` : ""}`
      : "{gray-fg}Observed: idle{/}",
    `Hydration: gateway={cyan-fg}${startup.phases.gateway.status}{/} cron={cyan-fg}${startup.phases.cron.status}{/} diag={cyan-fg}${startup.phases.diagnostics.status}{/} skills={cyan-fg}${startup.phases.skills.status}{/}`,
    active?.title
      ? `Session: {green-fg}${truncate(active.title, 28)}{/}`
      : `Session: {green-fg}${state.activeSessionId}{/}`,
    "",
    "{bold}Notices{/}",
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
    "{bold}Transport{/}",
    `live=${transportControl.totals.liveServices} configured=${transportControl.totals.gatewayEnabled} operational=${transportControl.totals.operationalTransports}`,
    `sessions=${gatewaySessions.length} voice=${gatewaySessions.filter((entry) => entry.voiceMode).length}`,
    "",
    "{bold}Channels{/}",
    ...transportControl.transportInventory.slice(0, 4).map((entry) => {
      const marker = entry.operational ? "{green-fg}●{/}" : "{red-fg}●{/}";
      return `${marker} ${entry.platform} ${entry.source} ${entry.operational ? "ready" : "blocked"}`;
    }),
    "",
    "{bold}Work{/}",
    `delegation=${delegation.running}/${delegation.pending}/${delegation.completed}`,
    `workers=${delegation.activeWorkers}`,
    "",
    "{bold}Plugins{/}",
    `enabled=${plugins.filter((entry) => entry.enabled).length}/${plugins.length}`,
    `official=${plugins.filter((entry) => entry.source === "official").length} vendored=${plugins.filter((entry) => entry.source === "vendored").length}`,
    `alpha=${audit.runtime.alpha}`,
    "",
    "{bold}Recent{/}",
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
  return [
    `${context.config.agentName} TUI`,
    busy
      ? `{yellow-fg}${escapeBlessed(busyFrame)} processing{/}`
      : "{green-fg}ready{/}",
    queueDepth > 0 ? `{cyan-fg}queue:${queueDepth}{/}` : "{gray-fg}queue:0{/}",
    `{cyan-fg}${escapeBlessed(settings.model.provider)}{/}`,
    `{cyan-fg}${escapeBlessed(settings.model.model)}{/}`,
    `{yellow-fg}${escapeBlessed(settings.agent.runDepth)}{/}`,
    `{yellow-fg}cap:${settings.agent.maxIterations}{/}`,
    `{yellow-fg}prog:${escapeBlessed(settings.agent.toolProgressMode)}{/}`,
    "{magenta-fg}Tab{/} complete",
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-P"))}{/} palette`,
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-E"))}{/} compose`,
    "{cyan-fg}!cmd{/} shell",
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-T/Y"))}{/} theme`,
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Alt-1..4"))}{/} deck`,
    hint,
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-Q"))}{/} quit`,
  ].join("  |  ");
}

async function startTui(
  context: AppContext,
  options?: StartCliOptions,
): Promise<void> {
  const state: CliState = { activeSessionId: "cli:local-user", notices: [] };
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
    top: "72%+2",
    left: 0,
    width: "68%",
    height: "28%-2",
    label: " Ops Log ",
    tags: true,
    border: "line",
    scrollback: 1000,
    wrap: true,
    keys: true,
    mouse: true,
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
    width: "68%",
    height: "72%-1",
    label: " Conversation ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    wrap: true,
    keys: true,
    mouse: true,
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
      "{gray-fg}Responses, JSON payloads, and operator output will render here.{/}",
  });

  const sidebar = blessed.box({
    parent: screen,
    top: 3,
    left: "68%",
    width: "32%",
    height: "30%",
    label: " Runtime ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    wrap: true,
    mouse: true,
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
    top: "30%+3",
    left: "68%",
    width: "32%",
    height: "22%",
    label: " Channels ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    wrap: true,
    mouse: true,
    keys: true,
    vi: true,
    padding: {
      left: 1,
      right: 1,
    },
    style: panelStyle(activeTheme, activeTheme.cyanGlow),
  });

  const executionBox = blessed.box({
    parent: screen,
    top: "52%+3",
    left: "68%",
    width: "32%",
    height: "18%",
    label: " Workbench ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    wrap: true,
    mouse: true,
    keys: true,
    vi: true,
    padding: {
      left: 1,
      right: 1,
    },
    style: panelStyle(activeTheme, activeTheme.greenGlow),
  });

  const assistBox = blessed.box({
    parent: screen,
    top: "70%+3",
    left: "68%",
    width: "32%",
    height: "18%-1",
    label: " Command Assist ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    wrap: true,
    mouse: true,
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
    label: " Command Palette ",
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
    inputOnFocus: true,
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
    mouse: true,
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
    label: " Multiline Composer ",
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
    inputOnFocus: true,
    keys: true,
    mouse: true,
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
    label: " Message / Command ",
    inputOnFocus: true,
    border: "line",
    mouse: true,
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
    return;
  }

  let screenDestroyed = false;
  let busy = false;
  let queueDepth = 0;
  let controlDeckMode: ControlDeckMode = "assist";
  let paletteSelectionIndex = 0;
  let composerOpen = false;
  const commandHistory: string[] = [];
  let historyIndex = 0;
  const pendingCommands: string[] = [];
  let paletteOpen = false;
  const responseHistory: ResponseTranscriptEntry[] = [];
  let liveResponse: ResponseTranscriptEntry | undefined;
  let liveToolTrail: string[] = [];
  const crashLogPath = join(context.config.dataDir, "cli-crash.log");
  mkdirSync(context.config.dataDir, { recursive: true });
  const focusables: blessed.Widgets.BlessedElement[] = [
    activity,
    response,
    sidebar,
    transportBox,
    executionBox,
    assistBox,
    inputBox,
  ];
  let focusIndex = focusables.length - 1;
  let shuttingDown = false;
  let busyFrameIndex = 0;
  let busySpinnerTimer: ReturnType<typeof setInterval> | null = null;
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
  const busyFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  function textEntryFocused(): boolean {
    return (
      screen.focused === inputBox ||
      screen.focused === composer ||
      screen.focused === paletteInput
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
    inputBox.focus();
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
    if (screen.focused === transportBox) {
      return "Enter gateway readiness";
    }
    if (screen.focused === executionBox) {
      return "Enter execution status";
    }
    if (screen.focused === assistBox) {
      return controlDeckMode === "assist"
        ? "Enter top suggestion"
        : controlDeckMode === "gateway"
          ? "Enter gateway supervision"
          : controlDeckMode === "ecosystem"
            ? "Enter runtime ecosystem"
            : "Enter responses list";
    }
    return "Esc input";
  }

  function updateFooterHint(): void {
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
    screen.render();
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
          : screen.focused === transportBox
            ? transportBox
            : screen.focused === executionBox
              ? executionBox
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
    if (pinnedToBottom) {
      response.setScrollPerc(100);
    }
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
    const toolOverlay = liveToolTrail.length
      ? `\n\n[live activity]\n${liveToolTrail.slice(-4).join("\n")}`
      : "";
    liveResponse = {
      label: options?.pending ? pendingRunLabel(label) : label,
      body: `${body}${toolOverlay}`.trim(),
      at: nowStamp(),
      kind: options?.kind,
      pending: options?.pending,
    };
    renderResponsePane();
  }

  function pushLiveToolEvent(detail: string): void {
    const nextLine = `- ${detail}`;
    if (liveToolTrail.at(-1) === nextLine) {
      return;
    }
    liveToolTrail.push(nextLine);
    if (liveToolTrail.length > 6) {
      liveToolTrail = liveToolTrail.slice(-6);
    }
    if (liveResponse) {
      const body = liveResponse.body.split("\n\n[live activity]\n")[0] ?? "";
      setLiveResponse(liveResponse.label, body, {
        kind: liveResponse.kind,
        pending: liveResponse.pending,
      });
    }
  }

  function focusAt(index: number): void {
    syncFocusIndexFromCurrentFocus();
    focusIndex = (index + focusables.length) % focusables.length;
    focusables[focusIndex]?.focus();
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
    paletteOpen = true;
    paletteOverlay.show();
    paletteInput.setValue(preservedValue);
    paletteList.setItems(renderPaletteItems(preservedValue));
    paletteSelectionIndex = 0;
    paletteList.select(0);
    paletteInput.focus();
    updateFooterHint();
    screen.render();
  }

  function closePalette(): void {
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
    composerOpen = true;
    composerOverlay.show();
    composer.setValue(preservedValue);
    composer.focus();
    updateFooterHint();
    screen.render();
  }

  function closeComposer(): void {
    composerOpen = false;
    composerOverlay.hide();
    composer.clearValue();
    focusPrimaryInput();
    updateFooterHint();
  }

  function setInputValue(value: string): void {
    inputBox.setValue(value);
    assistBox.setContent(renderSuggestionsContent(value));
    screen.render();
  }

  function controlDeckLabel(mode: ControlDeckMode): string {
    switch (mode) {
      case "ecosystem":
        return " Control Deck · Ecosystem ";
      case "gateway":
        return " Control Deck · Gateway ";
      case "responses":
        return " Control Deck · Responses ";
      default:
        return " Launchpad · Assist ";
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
    assistBox.setContent(renderSuggestionsContent(inputBox.getValue()));
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
      `{gray-fg}${nowStamp()}{/} ${toneTag(tone)} {bold}${escapeBlessed(kind)}{/bold} ${escapeBlessed(message)}`,
    );
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
          appendActivity(
            source === "stdout" ? "srv+" : "srv!",
            truncate(trimmed, 220),
            source === "stdout" ? "info" : "warning",
          );
        }

        if (source === "stdout") {
          stdoutBuffer = remainder;
        } else {
          stderrBuffer = remainder;
        }
        scheduleRefreshPanels(0);

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

  async function refreshPanels(): Promise<void> {
    sidebar.setContent(renderStatusContent(context, state));
    transportBox.setContent(await renderTransportContent(context));
    executionBox.setContent(await renderExecutionContent(context));
    await renderControlDeck(controlDeckMode);
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
    applyLayout(screen, {
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
    });
    screen.render();
  }

  async function processQueue(): Promise<void> {
    if (busy || pendingCommands.length === 0) {
      return;
    }

    busy = true;
    startBusySpinner();
    queueDepth = pendingCommands.length;
    await refreshPanels();

    const line = pendingCommands.shift();
    queueDepth = pendingCommands.length;

    if (!line) {
      busy = false;
      await refreshPanels();
      return;
    }

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
      const result = await executeCliInput(line, context, state, {
        onStream: ({ source, chunk, command }) => {
          const lines = chunk
            .split(/\r?\n/gu)
            .map((entry) => entry.trim())
            .filter(Boolean);
          if (!lines.length) {
            return;
          }
          for (const lineChunk of lines) {
            appendActivity(
              source === "stdout" ? "out+" : "err+",
              truncate(`${command}: ${lineChunk}`, 260),
              source === "stdout" ? "agent" : "warning",
            );
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
      busy = false;
      stopBusySpinner();
      if (!screenDestroyed) {
        try {
          await refreshPanels();
          inputBox.clearValue();
          if (controlDeckMode === "assist") {
            assistBox.setContent(renderSuggestionsContent(""));
          }
          inputBox.focus();
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
      inputBox.focus();
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
      assistBox.setContent(renderSuggestionsContent(""));
    }
    inputBox.focus();
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
    if (controlDeckMode === "assist") {
      assistBox.setContent(renderSuggestionsContent(inputBox.getValue()));
      screen.render();
      updateFooterHint();
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
    const query = paletteInput.getValue();
    paletteList.setItems(renderPaletteItems(query));
    paletteSelectionIndex = 0;
    paletteList.select(0);
    updateFooterHint();
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
    forceTerminateCli("SIGINT");
  };
  const handleSigterm = () => {
    forceTerminateCli("SIGTERM");
  };
  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);
  process.once("uncaughtException", handleUncaughtException);
  process.once("unhandledRejection", handleUnhandledRejection);
  const handleRawCtrlC = (chunk: string | Buffer) => {
    const value = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (value.includes("\u0003")) {
      forceTerminateCli("SIGINT");
    }
  };
  input.on("data", handleRawCtrlC);

  screen.key(["C-q", "C-c"], () => {
    exitCli();
  });
  screen.key(["q"], () => {
    if (textEntryFocused() || paletteOpen || composerOpen) {
      return;
    }
    exitCli();
  });
  screen.key(["C-p"], () => {
    openPalette(inputBox.getValue());
  });
  screen.key(["C-g"], () => {
    controlDeckMode = "gateway";
    void refreshPanels();
  });
  screen.key(["C-e"], () => {
    if (paletteOpen) {
      return;
    }
    openComposer(inputBox.getValue());
  });
  screen.key(["C-s"], () => {
    response.focus();
    screen.render();
  });
  screen.key(["C-t"], () => {
    queueCommand(canonicalizeSlashCommandSyntax("/theme next"));
  });
  screen.key(["C-y"], () => {
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
      paletteInput.focus();
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
    inputBox.focus();
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
  screen.key(["C-r"], () => {
    void refreshPanels();
  });
  screen.key(["M-1"], () => {
    controlDeckMode = "assist";
    void refreshPanels();
  });
  screen.key(["M-2"], () => {
    controlDeckMode = "ecosystem";
    void refreshPanels();
  });
  screen.key(["M-3"], () => {
    controlDeckMode = "gateway";
    void refreshPanels();
  });
  screen.key(["M-4"], () => {
    controlDeckMode = "responses";
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
    if (screen.focused === transportBox) {
      queueCommand(canonicalizeSlashCommandSyntax("/gateway readiness"));
      return;
    }
    if (screen.focused === executionBox) {
      queueCommand(canonicalizeSlashCommandSyntax("/execution status"));
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
    [["S-f12"], "/runtime transports"],
  ];

  for (const [keys, command] of hotkeys) {
    screen.key(keys, () => {
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
    transportBox,
    executionBox,
    assistBox,
    paletteInput,
    paletteList,
    composer,
    inputBox,
  ]) {
    element.on("focus", () => updateFooterHint());
    element.on("click", () => updateFooterHint());
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
      appendActivity(
        "exec",
        `${event.detail} -> ${event.exitCode}`,
        event.exitCode === 0 ? "success" : "warning",
      );
      if (busy) {
        pushLiveToolEvent(
          `shell ${truncate(event.detail, 64)} → ${event.exitCode}`,
        );
      }
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
        pushLiveToolEvent(detail);
        if (liveResponse?.pending) {
          const body =
            liveResponse.body.split("\n\n[live activity]\n")[0] ?? "";
          setLiveResponse(baseLabelForLiveKind(liveResponse.kind), body, {
            kind: liveResponse.kind,
            pending: true,
          });
        }
        if (event.type === "error" || event.type === "approvals") {
          appendActivity(
            "run",
            truncate(detail, 160),
            event.type === "error" ? "warning" : "info",
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
    `${context.config.agentName} helm online. Type /help for shortcuts and examples.`,
    "success",
  );
  appendActivity(
    "tip",
    `Use ${macAwareKeyLabel("Ctrl-E")} for multiline compose, start a shell action with !, and use ${canonicalizeSlashCommandSyntax("/theme list")} to explore palettes.`,
    "info",
  );
  pushResponseEntry(
    "Helm Ready",
    `You are live in the Eliza Agent helm.\n\nTalk to me normally, or run a shell action like !git status.\n\nFor operator state, try ${canonicalizeSlashCommandSyntax("/status")}, ${canonicalizeSlashCommandSyntax("/mode")}, ${canonicalizeSlashCommandSyntax("/progress")}, ${canonicalizeSlashCommandSyntax("/accounts")}, or ${canonicalizeSlashCommandSyntax("/gateway readiness")}.`,
  );
  transportBox.setContent(await renderTransportContent(context));
  executionBox.setContent(await renderExecutionContent(context));
  await renderControlDeck(controlDeckMode);

  applyThemeToScreen(activeTheme);
  await refreshPanels();
  syncLayout();
  inputBox.focus();
  updateFooterHint();
  screen.render();
  options?.onReady?.();
  setTimeout(() => {
    void context.ensureDeferredHydration("tui");
  }, 25).unref?.();

  await new Promise<void>((resolve) => {
    screen.on("destroy", () => {
      screenDestroyed = true;
      stopBusySpinner();
      input.removeListener("data", handleRawCtrlC);
      process.removeListener("SIGINT", handleSigint);
      process.removeListener("SIGTERM", handleSigterm);
      process.removeListener("uncaughtException", handleUncaughtException);
      process.removeListener("unhandledRejection", handleUnhandledRejection);
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      resolve();
    });
  });
}

export async function startCli(
  context: AppContext,
  options?: StartCliOptions,
): Promise<void> {
  const forcePlain = Bun.argv.includes("--plain-cli");
  const canUseTui = input.isTTY && output.isTTY && !forcePlain;

  if (!canUseTui) {
    await startPlainCli(context, options);
    return;
  }

  try {
    await startTui(context, options);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(
      `${context.config.agentName} TUI failed to start (${detail}). Falling back to plain CLI.`,
    );
    await startPlainCli(context, options);
  }
}
