import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import blessed from "blessed";
import type { AppContext } from "@/runtime/bootstrap";
import { handleAgentTurn } from "@/runtime/chat";
import { COMMAND_CATALOG, suggestCommands } from "@/runtime/command-catalog";
import { getNativePackageAudit } from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import {
  getEffectiveServiceResolution,
  getNativeTransportControlPlane,
} from "@/runtime/native/service-bridge";

interface CliState {
  activeSessionId: string;
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
}

type ControlDeckMode = "assist" | "ecosystem" | "gateway" | "responses";

function nowStamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function compactJsonLine(value: unknown): string {
  const raw = JSON.stringify(value);
  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}

function compactPreview(text: string): string {
  if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
    return truncate(text, 180);
  }

  try {
    return compactJsonLine(JSON.parse(text) as unknown);
  } catch {
    return truncate(text, 180);
  }
}

function summarizeTransportInventory(
  inventory: Array<{
    platform: string;
    source: string;
    configEnabled: boolean;
    gatewayEnabled: boolean;
    operational: boolean;
    reason: string;
    detail: string;
  }>,
): string {
  const totals = {
    operational: inventory.filter((entry) => entry.operational).length,
    configEnabled: inventory.filter((entry) => entry.configEnabled).length,
    gatewayEnabled: inventory.filter((entry) => entry.gatewayEnabled).length,
    official: inventory.filter((entry) => entry.source === "official").length,
    vendored: inventory.filter((entry) => entry.source === "vendored").length,
    custom: inventory.filter((entry) => entry.source === "custom").length,
    product: inventory.filter((entry) => entry.source === "product").length,
  };

  return [
    `Inventory totals: operational=${totals.operational}/${inventory.length} config=${totals.configEnabled} gateway=${totals.gatewayEnabled}`,
    `Sources: official=${totals.official} vendored=${totals.vendored} custom=${totals.custom} product=${totals.product}`,
    ...inventory.map(
      (entry) =>
        `- ${entry.platform} ${entry.source} cfg=${entry.configEnabled ? "on" : "off"} gate=${entry.gatewayEnabled ? "on" : "off"} op=${entry.operational ? "yes" : "no"} ${entry.reason} :: ${truncate(entry.detail, 72)}`,
    ),
  ].join("\n");
}

function truncate(text: string, max = 280): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > max
    ? `${normalized.slice(0, Math.max(0, max - 3))}...`
    : normalized;
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
  return [
    `${agentName} TUI shortcuts`,
    "",
    "Global:",
    "  q / Ctrl-C       Quit",
    "  Esc              Focus command input",
    "  Ctrl-L           Clear activity feed",
    "  Ctrl-R           Refresh status panels",
    "  Ctrl-G           Open control deck quick actions",
    "  Alt-1..Alt-4     Switch control deck mode",
    "  Tab              Complete the top suggested command",
    "  PageUp/PageDown  Scroll activity",
    "  Up/Down          Command history in input",
    "",
    "Hotkeys:",
    "  F2  /status",
    "  F3  /tools summary",
    "  F4  /delegate overview",
    "  F5  /gateway readiness",
    "  F6  /sessions list",
    "  F7  /doctor",
    "  F8  /runtime plugins",
    "  F9  /runtime ecosystem",
    "  F10 /gateway history limit:10",
    "  F11 /gateway supervision",
    "  F12 /responses list",
    "  Shift-F12 /runtime transports",
    "",
    "Examples:",
    "  /skills list",
    "  /execution status",
    "  /transport inventory",
    "  /transport show telegram",
    "  /transport mismatches",
    "  /browser capture https://example.com",
    "  /media analyze ./recordings/demo.wav",
    "  /delegate create Research spike :: validate a transport path",
    "  /trajectories ingest gateway label:review limit:100",
  ].join("\n");
}

function renderEcosystemContent(context: AppContext): string {
  const audit = getNativePackageAudit(context.config);
  const resolution = getEffectiveServiceResolution(context.runtime);
  const latest = audit.runtime.latest;
  const alpha = audit.runtime.alpha;

  return [
    "{bold}Runtime Line{/}",
    `Latest: {cyan-fg}${latest}{/}`,
    `Alpha: {green-fg}${alpha}{/}`,
    "",
    "{bold}Package Audit{/}",
    `Aligned: ${audit.packages.filter((entry) => entry.compatibility === "aligned").length}`,
    `Alpha-only: ${audit.packages.filter((entry) => entry.compatibility === "alpha-only").length}`,
    `Lagging latest: ${audit.packages.filter((entry) => entry.compatibility === "lagging-latest").length}`,
    `Vendored: ${audit.packages.filter((entry) => entry.compatibility === "vendored-by-design").length}`,
    `Workspace-only: ${audit.packages.filter((entry) => entry.compatibility === "workspace-only").length}`,
    `Native services: ${resolution.filter((entry) => entry.source === "native").length}/${resolution.length}`,
    "",
    "{bold}Priority Packages{/}",
    ...audit.packages
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
  ).split("\n");

  return [
    "{bold}Canonical Transport Inventory{/}",
    `Configured: ${gatewayState.totals.configuredPlatforms}`,
    `Plugin-mediated: ${gatewayState.totals.pluginMediatedAdapters}/${gatewayState.totals.configuredPlatforms}`,
    `Operational: ${runtimeStatus.transportControl.operationalTransports}/${runtimeStatus.transportInventory.length}`,
    `Live bridges: ${runtimeStatus.transportControl.liveServices}/${runtimeStatus.transportControl.gatewayEnabled}`,
    `Sources: official=${runtimeStatus.transportControl.officialPlugins} vendored=${runtimeStatus.transportControl.vendoredPlugins} custom=${runtimeStatus.transportControl.customTransports} product=${runtimeStatus.transportControl.productTransports}`,
    "",
    "{bold}Inventory Summary{/}",
    ...(inventorySummary.length
      ? inventorySummary.slice(0, 2)
      : ["{gray-fg}No transport inventory available.{/}"]),
    "",
    "{bold}Shared Inventory{/}",
    ...(runtimeStatus.transportInventory.length
      ? runtimeStatus.transportInventory.map(
          (entry) =>
            `- ${entry.platform} ${entry.source} cfg=${entry.configEnabled ? "on" : "off"} gate=${entry.gatewayEnabled ? "on" : "off"} op=${entry.operational ? "yes" : "no"} ${entry.reason}`,
        )
      : ["{gray-fg}No transport inventory available.{/}"]),
    "",
    "{bold}Drill-Down{/}",
    "Try /transport show telegram for a single-platform view.",
    "",
    "{bold}Recent Gateway Traces{/}",
    ...(traces.length
      ? traces.map(
          (trace) =>
            `- ${trace.platform}:${trace.kind} ${truncate(trace.detail ?? trace.traceId, 34)}`,
        )
      : ["{gray-fg}No recent trace activity.{/}"]),
    "",
    "{bold}Platform State{/}",
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
  const health = await context.services.terminal.health();
  const recent = context.services.terminal.recent(4);
  const delegation = context.services.delegation.overview();
  const pipeline = context.services.autocoderPipeline.summary();
  const pipelineRuns = context.services.autocoderPipeline.list(4);

  return [
    "{bold}Execution Backends{/}",
    ...health
      .slice(0, 4)
      .map(
        (entry) =>
          `- ${entry.backend} ${
            entry.ready ? "{green-fg}ready{/}" : "{red-fg}blocked{/}"
          }`,
      ),
    "",
    "{bold}Recent Commands{/}",
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
    `Pending: ${delegation.pending}`,
    `Running: ${delegation.running}`,
    `Workers: ${delegation.activeWorkers}`,
    "",
    "{bold}Native Pipeline{/}",
    `Runs: ${pipeline.total}`,
    `Failed: ${pipeline.failed}`,
    pipeline.latest
      ? `Latest: ${pipeline.latest.kind} ${truncate(pipeline.latest.projectName ?? pipeline.latest.repositoryName ?? pipeline.latest.id, 26)}`
      : "Latest: n/a",
    ...(pipelineRuns.length
      ? pipelineRuns.map(
          (entry) =>
            `- ${entry.kind} ${truncate(entry.projectName ?? entry.repositoryName ?? entry.id, 24)} {gray-fg}${entry.status}{/}`,
        )
      : ["{gray-fg}No pipeline runs yet.{/}"]),
  ].join("\n");
}

function renderSuggestionsContent(inputValue: string): string {
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
  if (trimmed === "/help") {
    return { text: buildHelpText(context.config.agentName), tone: "info" };
  }

  if (trimmed === "/gateway start") {
    await context.gateway.start();
    return { text: "Gateway started.", tone: "success" };
  }
  if (trimmed === "/gateway stop") {
    await context.gateway.stop();
    return { text: "Gateway stopped.", tone: "warning" };
  }
  if (trimmed === "/gateway status") {
    const health = await context.gateway.health();
    return { text: formatJson(health), tone: "info" };
  }
  if (trimmed === "/runtime ecosystem" || trimmed === "/plugins ecosystem") {
    return {
      text: formatJson({
        runtime: getNativePackageAudit(context.config).runtime,
        audit: getNativePackageAudit(context.config),
      }),
      tone: "info",
    };
  }
  if (trimmed === "/runtime status") {
    return {
      text: formatJson({
        provider: context.services.settings.get().model.provider,
        model: context.services.settings.get().model.model,
        plugins: {
          openai: Boolean(context.config.openAiApiKey),
          anthropic: Boolean(context.config.anthropicApiKey),
          pdf: true,
          telegram: Boolean(context.config.telegramBotToken),
        },
      }),
      tone: "info",
    };
  }
  if (trimmed === "/gateway config") {
    return {
      text: formatJson(context.services.gatewayConfig),
      tone: "info",
    };
  }
  if (trimmed === "/gateway supervision") {
    return {
      text: formatJson(context.gateway.supervision(20)),
      tone: "info",
    };
  }
  if (trimmed === "/gateway daemon") {
    return {
      text: formatJson(context.gateway.runtimeStatus().daemon),
      tone: "info",
    };
  }
  if (trimmed === "/gateway journal") {
    const history = await context.gateway.history(10);
    return { text: formatJson(history), tone: "info" };
  }
  if (trimmed.startsWith("/gateway replay ")) {
    const raw = trimmed.replace("/gateway replay ", "").trim();
    const target =
      raw === "latest" ? context.gateway.inbox(1).at(0)?.recordId : raw;
    if (!target) {
      return {
        text: "No gateway inbox records available to replay.",
        tone: "warning",
      };
    }
    return {
      text: formatJson(await context.gateway.replayInbox(target)),
      tone: "success",
    };
  }
  if (trimmed === "/responses list") {
    return {
      text: formatJson(context.services.apiTransport.list(20)),
      tone: "info",
    };
  }
  if (trimmed.startsWith("/responses show ")) {
    const id = trimmed.replace("/responses show ", "").trim();
    if (!id) {
      return { text: "Usage: /responses show <id>", tone: "warning" };
    }
    const record = context.services.apiTransport.get(id);
    return record
      ? { text: formatJson(record), tone: "info" }
      : { text: `Response ${id} not found.`, tone: "warning" };
  }
  if (trimmed.startsWith("/pdf extract ")) {
    const path = trimmed.replace("/pdf extract ", "").trim();
    if (!path) {
      return { text: "Usage: /pdf extract <path>", tone: "warning" };
    }
    const extracted = await context.services.documents.extractPdfFromPath(path);
    return { text: extracted, tone: "agent" };
  }
  if (trimmed.startsWith("/gateway receive ")) {
    const payload = trimmed.replace("/gateway receive ", "");
    const [head, text] = payload.split("::").map((part) => part.trim());
    const [platform, userId, roomId] = head.split(/\s+/u);
    if (!platform || !userId || !roomId || !text) {
      return {
        text: "Usage: /gateway receive <platform> <userId> <roomId> :: <message>",
        tone: "warning",
      };
    }
    const result = await context.gateway.receive({
      platform: platform as never,
      userId,
      roomId,
      text,
    });
    return { text: formatJson(result), tone: "info" };
  }
  if (trimmed === "/pairing pending") {
    return {
      text: formatJson(context.services.pairing.listPending()),
      tone: "info",
    };
  }
  if (trimmed.startsWith("/pairing approve ")) {
    const [, , platform, code] = trimmed.split(/\s+/u);
    const approved = context.services.pairing.approve(platform as never, code);
    return { text: formatJson(approved), tone: "success" };
  }
  if (trimmed.startsWith("/pairing deny ")) {
    const [, , platform, code] = trimmed.split(/\s+/u);
    const denied = context.services.pairing.deny(platform as never, code);
    return { text: formatJson(denied), tone: "warning" };
  }
  if (trimmed === "/hooks list") {
    return { text: formatJson(context.services.hooks.list()), tone: "info" };
  }
  if (trimmed.startsWith("/hooks add ")) {
    const payload = trimmed.replace("/hooks add ", "");
    const [head, template] = payload.split("::").map((part) => part.trim());
    const [event, ...nameParts] = head.split(/\s+/u);
    const name = nameParts.join(" ") || event;
    if (!event || !template) {
      return {
        text: "Usage: /hooks add <event> <name?> :: <template>",
        tone: "warning",
      };
    }
    const hook = context.services.hooks.add({
      event,
      name,
      enabled: true,
      template,
    });
    return { text: formatJson(hook), tone: "success" };
  }
  if (trimmed === "/hooks recent") {
    return {
      text: formatJson(context.services.hooks.recentInvocations()),
      tone: "info",
    };
  }
  if (trimmed === "/sessions gateway") {
    return {
      text: formatJson(context.services.gatewaySessions.list()),
      tone: "info",
    };
  }
  if (trimmed === "/resume") {
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
  if (trimmed.startsWith("/resume ")) {
    const query = trimmed.replace("/resume ", "").trim();
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

  if (trimmed.startsWith("/terminal run ")) {
    const command = trimmed.replace("/terminal run ", "").trim();
    if (!command) {
      return { text: "Usage: /terminal run <command>", tone: "warning" };
    }
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
    return {
      text: [
        `Command: ${result.command}`,
        `Exit: ${result.exitCode}`,
        `STDOUT:\n${result.stdout || "(empty)"}`,
        `STDERR:\n${result.stderr || "(empty)"}`,
      ].join("\n"),
      tone: result.exitCode === 0 ? "success" : "warning",
    };
  }

  const response = await handleAgentTurn(
    {
      message: trimmed,
      userId: "local-user",
      roomId: state.activeSessionId,
      source: "cli",
    },
    context,
  );

  return { text: response, tone: "agent" };
}

async function startPlainCli(context: AppContext): Promise<void> {
  const rl = createInterface({ input, output });
  const state: CliState = { activeSessionId: "cli:local-user" };
  let closed = false;

  rl.on("close", () => {
    closed = true;
  });

  output.write(`${context.config.agentName} CLI\n`);
  output.write(
    'Type "exit" to quit. Try /help, /status, /transport inventory, /transport mismatches, /gateway readiness, /runtime plugins, or /delegate overview.\n\n',
  );

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
      if (result.shouldExit) {
        break;
      }
    } catch (error) {
      output.write(
        `\nError: ${error instanceof Error ? error.message : String(error)}\n\n`,
      );
    }
  }

  if (!closed) {
    rl.close();
  }
}

function renderStatusContent(context: AppContext, state: CliState): string {
  const settings = context.services.settings.get();
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
  const active = sessions.find(
    (entry) => entry.sessionId === state.activeSessionId,
  );

  return [
    "{bold}Runtime{/}",
    `Provider: {cyan-fg}${settings.model.provider}{/}`,
    `Model: {cyan-fg}${settings.model.model}{/}`,
    `Session: {green-fg}${state.activeSessionId}{/}`,
    active?.title ? `Title: ${active.title}` : "Title: (untitled)",
    "",
    "{bold}Transport Control{/}",
    `Configured: ${transportControl.totals.gatewayEnabled}`,
    `Operational: ${transportControl.totals.operationalTransports}/${transportControl.transportInventory.length}`,
    `Live bridges: ${transportControl.totals.liveServices}/${transportControl.totals.gatewayEnabled}`,
    `Plugin-mediated: ${transportControl.totals.enabledPlugins}`,
    `Sessions: ${gatewaySessions.length}`,
    `Voice: ${gatewaySessions.filter((entry) => entry.voiceMode).length} active`,
    "",
    "{bold}Inventory{/}",
    ...transportControl.transportInventory.slice(0, 4).map((entry) => {
      const marker = entry.operational ? "{green-fg}●{/}" : "{red-fg}●{/}";
      return `${marker} ${entry.platform} ${entry.source} cfg=${entry.configEnabled ? "on" : "off"} gate=${entry.gatewayEnabled ? "on" : "off"} ${entry.reason}`;
    }),
    "",
    "{bold}Delegation{/}",
    `Pending: ${delegation.pending}`,
    `Running: ${delegation.running}`,
    `Completed: ${delegation.completed}`,
    `Workers: ${delegation.activeWorkers}`,
    "",
    "{bold}Native Plugins{/}",
    `Enabled: ${plugins.filter((entry) => entry.enabled).length}/${plugins.length}`,
    `Official: ${plugins.filter((entry) => entry.source === "official").length}`,
    `Vendored: ${plugins.filter((entry) => entry.source === "vendored").length}`,
    `Alpha: ${audit.runtime.alpha}`,
    "",
    "{bold}Recent Sessions{/}",
    ...sessions.slice(0, 4).map((entry) => {
      const marker = entry.sessionId === state.activeSessionId ? "*" : "-";
      return `${marker} ${truncate(entry.title ?? entry.sessionId, 26)}`;
    }),
  ].join("\n");
}

function renderFooter(
  context: AppContext,
  busy: boolean,
  queueDepth: number,
): string {
  return [
    `${context.config.agentName} TUI`,
    busy ? "{yellow-fg}processing{/}" : "{green-fg}ready{/}",
    queueDepth > 0 ? `{cyan-fg}queue:${queueDepth}{/}` : "{gray-fg}queue:0{/}",
    "{magenta-fg}Tab{/} complete",
    "Esc input",
    "q quit",
  ].join("  |  ");
}

async function startTui(context: AppContext): Promise<void> {
  const state: CliState = { activeSessionId: "cli:local-user" };
  const unsubscribers: Array<() => void> = [];
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: `${context.config.agentName} TUI`,
    dockBorders: true,
  });

  blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    style: {
      fg: "white",
      bg: "blue",
    },
    content: `{bold}${context.config.agentName}{/bold}  {gray-fg}ElizaOS-native operator cockpit{/}  {white-fg}Monorepo + native plugin stack{/}`,
  });

  const activity = blessed.log({
    parent: screen,
    top: 3,
    left: 0,
    width: "68%",
    height: "70%-1",
    label: " Activity Feed ",
    tags: true,
    border: "line",
    scrollback: 1000,
    keys: true,
    mouse: true,
    vi: true,
    scrollbar: {
      ch: " ",
    },
    style: {
      border: { fg: "cyan" },
      label: { fg: "cyan", bold: true },
    },
  });

  const response = blessed.box({
    parent: screen,
    top: "70%+2",
    left: 0,
    width: "68%",
    height: "30%-2",
    label: " Last Response ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
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
    style: {
      border: { fg: "magenta" },
      label: { fg: "magenta", bold: true },
    },
    content:
      "{gray-fg}Responses, JSON payloads, and operator output will render here.{/}",
  });

  const sidebar = blessed.box({
    parent: screen,
    top: 3,
    left: "68%",
    width: "32%",
    height: "30%",
    label: " Runtime Snapshot ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
    padding: {
      left: 1,
      right: 1,
    },
    style: {
      border: { fg: "green" },
      label: { fg: "green", bold: true },
    },
  });

  const transportBox = blessed.box({
    parent: screen,
    top: "30%+3",
    left: "68%",
    width: "32%",
    height: "22%",
    label: " Live Transport ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
    padding: {
      left: 1,
      right: 1,
    },
    style: {
      border: { fg: "cyan" },
      label: { fg: "cyan", bold: true },
    },
  });

  const executionBox = blessed.box({
    parent: screen,
    top: "52%+3",
    left: "68%",
    width: "32%",
    height: "18%",
    label: " Execution + Queue ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
    padding: {
      left: 1,
      right: 1,
    },
    style: {
      border: { fg: "green" },
      label: { fg: "green", bold: true },
    },
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
    mouse: true,
    keys: true,
    vi: true,
    padding: {
      left: 1,
      right: 1,
    },
    style: {
      border: { fg: "yellow" },
      label: { fg: "yellow", bold: true },
    },
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
      fg: "white",
      bg: "black",
      border: { fg: "magenta" },
      label: { fg: "magenta", bold: true },
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
      border: { fg: "yellow" },
      label: { fg: "yellow", bold: true },
      focus: {
        border: { fg: "green" },
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
      border: { fg: "cyan" },
      selected: {
        bg: "blue",
        fg: "white",
      },
      item: {
        fg: "white",
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
      fg: "white",
      bg: "black",
      border: { fg: "green" },
      label: { fg: "green", bold: true },
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
      border: { fg: "green" },
      label: { fg: "green", bold: true },
      focus: {
        border: { fg: "yellow" },
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
    label: " Command ",
    inputOnFocus: true,
    border: "line",
    mouse: true,
    keys: true,
    tags: false,
    style: {
      fg: "white",
      bg: "black",
      border: { fg: "blue" },
      label: { fg: "blue", bold: true },
      focus: {
        border: { fg: "magenta" },
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
      fg: "white",
      bg: "gray",
    },
  });

  let busy = false;
  let queueDepth = 0;
  let controlDeckMode: ControlDeckMode = "assist";
  let paletteSelectionIndex = 0;
  let composerOpen = false;
  const commandHistory: string[] = [];
  let historyIndex = 0;
  const pendingCommands: string[] = [];
  let paletteOpen = false;
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

  function focusAt(index: number): void {
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
    paletteOpen = true;
    paletteOverlay.show();
    paletteInput.setValue(initialValue);
    paletteList.setItems(renderPaletteItems(initialValue));
    paletteSelectionIndex = 0;
    paletteList.select(0);
    paletteInput.focus();
    screen.render();
  }

  function closePalette(): void {
    paletteOpen = false;
    paletteOverlay.hide();
    paletteInput.clearValue();
    paletteList.setItems([]);
    inputBox.focus();
    screen.render();
  }

  function openComposer(initialValue = ""): void {
    composerOpen = true;
    composerOverlay.show();
    composer.setValue(initialValue);
    composer.focus();
    screen.render();
  }

  function closeComposer(): void {
    composerOpen = false;
    composerOverlay.hide();
    composer.clearValue();
    inputBox.focus();
    screen.render();
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
        return " Control Deck · Assist ";
    }
  }

  async function renderControlDeck(mode: ControlDeckMode): Promise<void> {
    assistBox.setLabel(controlDeckLabel(mode));
    if (mode === "ecosystem") {
      assistBox.setContent(renderEcosystemContent(context));
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

  function appendActivity(
    kind: string,
    message: string,
    tone: CliExecutionResult["tone"],
  ): void {
    activity.log(
      `{gray-fg}${nowStamp()}{/} ${toneTag(tone)} {bold}${kind}{/bold} ${message}`,
    );
  }

  async function refreshPanels(): Promise<void> {
    sidebar.setContent(renderStatusContent(context, state));
    transportBox.setContent(await renderTransportContent(context));
    executionBox.setContent(await renderExecutionContent(context));
    await renderControlDeck(controlDeckMode);
    footer.setContent(renderFooter(context, busy, queueDepth));
    screen.render();
  }

  async function processQueue(): Promise<void> {
    if (busy || pendingCommands.length === 0) {
      return;
    }

    busy = true;
    queueDepth = pendingCommands.length;
    await refreshPanels();

    const line = pendingCommands.shift();
    queueDepth = pendingCommands.length;

    if (!line) {
      busy = false;
      await refreshPanels();
      return;
    }

    appendActivity("cmd", `{white-fg}${line}{/}`, "info");

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
              truncate(`${command}: ${lineChunk}`, 180),
              source === "stdout" ? "agent" : "warning",
            );
          }
          const streamed = lines.join("\n");
          const current = response.getContent();
          response.setContent(
            current?.trim()
              ? `${current}\n${source.toUpperCase()}: ${streamed}`
              : `${source.toUpperCase()}: ${streamed}`,
          );
          screen.render();
        },
      });
      if (result.text) {
        response.setContent(result.text);
        appendActivity(
          result.tone === "agent" ? "agent" : "out",
          compactPreview(result.text),
          result.tone,
        );
      }
      if (result.shouldExit) {
        screen.destroy();
        return;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      response.setContent(`Error: ${detail}`);
      appendActivity("err", detail, "error");
    } finally {
      busy = false;
      await refreshPanels();
      inputBox.clearValue();
      if (controlDeckMode === "assist") {
        assistBox.setContent(renderSuggestionsContent(""));
      }
      inputBox.focus();
      screen.render();
      void processQueue();
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

  inputBox.key("enter", () => {
    inputBox.submit();
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

  paletteList.on("select item", (_, index) => {
    paletteSelectionIndex = index;
    const selected = suggestCommands(paletteInput.getValue(), 12)[index];
    if (!selected) {
      return;
    }
    closePalette();
    queueCommand(selected.command);
  });
  for (const key of ["up", "down", "j", "k"]) {
    paletteList.key(key, () => {
      const suggestions = suggestCommands(paletteInput.getValue(), 12);
      const current = suggestions[paletteSelectionIndex];
      if (!current) {
        paletteSelectionIndex = 0;
        paletteList.select(0);
        screen.render();
        return;
      }
      const nextIndex =
        key === "up" || key === "k"
          ? Math.max(0, paletteSelectionIndex - 1)
          : Math.min(suggestions.length - 1, paletteSelectionIndex + 1);
      paletteSelectionIndex = nextIndex;
      paletteList.select(nextIndex);
      screen.render();
    });
  }

  screen.key(["q", "C-c"], () => {
    screen.destroy();
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
  screen.key(["tab"], () => {
    if (composerOpen) {
      return;
    }
    if (paletteOpen) {
      paletteList.focus();
      screen.render();
      return;
    }
    focusAt(focusIndex + 1);
  });
  screen.key(["S-tab"], () => {
    if (composerOpen) {
      return;
    }
    if (paletteOpen) {
      paletteInput.focus();
      screen.render();
      return;
    }
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
    screen.render();
  });
  screen.key(["C-l"], () => {
    activity.setContent("");
    response.setContent("{gray-fg}Response pane cleared.{/}");
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
    activity.scroll(-8);
    screen.render();
  });
  screen.key(["pagedown"], () => {
    activity.scroll(8);
    screen.render();
  });
  screen.key(["enter"], () => {
    if (screen.focused === sidebar) {
      queueCommand("/sessions list");
      return;
    }
    if (screen.focused === transportBox) {
      queueCommand("/gateway readiness");
      return;
    }
    if (screen.focused === executionBox) {
      queueCommand("/execution status");
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
        queueCommand("/runtime ecosystem");
        return;
      }
      if (controlDeckMode === "gateway") {
        queueCommand("/gateway supervision");
        return;
      }
      queueCommand("/responses list");
    }
  });

  const hotkeys: Array<[string[], string]> = [
    [["f2"], "/status"],
    [["f3"], "/tools summary"],
    [["f4"], "/delegate overview"],
    [["f5"], "/gateway readiness"],
    [["f6"], "/sessions list"],
    [["f7"], "/doctor"],
    [["f8"], "/runtime plugins"],
    [["f9"], "/runtime ecosystem"],
    [["f10"], "/gateway history limit:10"],
    [["f11"], "/gateway supervision"],
    [["f12"], "/responses list"],
    [["S-f12"], "/runtime transports"],
  ];

  for (const [keys, command] of hotkeys) {
    screen.key(keys, () => {
      queueCommand(command);
    });
  }

  unsubscribers.push(
    context.gateway.onUpdate((event) => {
      appendActivity(
        event.platform === "gateway" ? "gw" : event.platform,
        truncate(event.detail, 160),
        event.kind === "reject" ? "warning" : "info",
      );
      void refreshPanels();
    }),
  );
  unsubscribers.push(
    context.services.terminal.onUpdate((event) => {
      appendActivity(
        "exec",
        `${event.detail} -> ${event.exitCode}`,
        event.exitCode === 0 ? "success" : "warning",
      );
      void refreshPanels();
    }),
  );
  unsubscribers.push(
    context.services.delegation.onUpdate((event) => {
      appendActivity("task", truncate(event.detail, 160), "info");
      void refreshPanels();
    }),
  );
  unsubscribers.push(
    context.services.sessions.onActivity((event) => {
      appendActivity("mem", truncate(event.detail, 160), "agent");
      void refreshPanels();
    }),
  );
  unsubscribers.push(
    context.services.apiTransport.onUpdate((event) => {
      appendActivity(
        "api",
        `${event.record.id} ${truncate(event.record.outputText, 120)}`,
        "agent",
      );
      void refreshPanels();
    }),
  );

  appendActivity(
    "boot",
    `${context.config.agentName} TUI online. Type /help for shortcuts and examples.`,
    "success",
  );
  appendActivity(
    "tip",
    "Use Ctrl-E for multiline compose, Tab for command completion, and streamed local terminal output will appear live in the feed.",
    "info",
  );
  response.setContent(
    "{bold}Operator Cockpit Ready{/}\n\nUse the right rail for runtime, transport, execution, and command assist.\nTry /help, /transport inventory, /transport mismatches, /gateway readiness, /execution status, /browser capture <url>, or /delegate overview.",
  );
  transportBox.setContent(await renderTransportContent(context));
  executionBox.setContent(await renderExecutionContent(context));
  await renderControlDeck(controlDeckMode);

  await refreshPanels();
  inputBox.focus();
  screen.render();

  await new Promise<void>((resolve) => {
    screen.on("destroy", () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      resolve();
    });
  });
}

export async function startCli(context: AppContext): Promise<void> {
  const forcePlain = Bun.argv.includes("--plain-cli");
  const canUseTui = input.isTTY && output.isTTY && !forcePlain;

  if (!canUseTui) {
    await startPlainCli(context);
    return;
  }

  await startTui(context);
}
