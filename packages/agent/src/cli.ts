import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import blessed from "blessed";
import type { AppContext } from "@/runtime/bootstrap";
import { handleAgentTurn } from "@/runtime/chat";
import { COMMAND_CATALOG, suggestCommands } from "@/runtime/command-catalog";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";

interface CliState {
  activeSessionId: string;
}

interface CliExecutionResult {
  text: string;
  tone?: "info" | "success" | "warning" | "error" | "agent";
  shouldExit?: boolean;
}

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
    "",
    "Examples:",
    "  /skills list",
    "  /execution status",
    "  /browser capture https://example.com",
    "  /media analyze ./recordings/demo.wav",
    "  /delegate create Research spike :: validate a transport path",
    "  /trajectories ingest gateway label:review limit:100",
  ].join("\n");
}

function renderTransportContent(context: AppContext): string {
  const traces = context.gateway.trace(6);
  const inbox = context.gateway.inbox(3);
  const sessions = context.services.gatewaySessions.list().slice(0, 4);

  return [
    "{bold}Recent Gateway Traces{/}",
    ...(traces.length
      ? traces.map(
          (trace) =>
            `- ${trace.platform}:${trace.kind} ${truncate(trace.detail ?? trace.traceId, 34)}`,
        )
      : ["{gray-fg}No recent trace activity.{/}"]),
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
    'Type "exit" to quit. Try /help, /status, /doctor, /tools summary, /gateway readiness, /runtime plugins, or /delegate overview.\n\n',
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
  const sessions = context.services.sessions.listSessions(6);
  const delegation = context.services.delegation.overview();
  const gatewaySessions = context.services.gatewaySessions.list();
  const active = sessions.find(
    (entry) => entry.sessionId === state.activeSessionId,
  );
  const readyPlatforms = Object.entries(
    context.services.gatewayConfig.platforms,
  )
    .filter(([, config]) => config.enabled)
    .map(([platform]) => platform);

  return [
    "{bold}Runtime{/}",
    `Provider: {cyan-fg}${settings.model.provider}{/}`,
    `Model: {cyan-fg}${settings.model.model}{/}`,
    `Session: {green-fg}${state.activeSessionId}{/}`,
    active?.title ? `Title: ${active.title}` : "Title: (untitled)",
    "",
    "{bold}Gateway{/}",
    `Configured: ${readyPlatforms.length}`,
    `Sessions: ${gatewaySessions.length}`,
    `Voice: ${
      gatewaySessions.filter((entry) => entry.voiceMode).length
    } active`,
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
  const commandHistory: string[] = [];
  let historyIndex = 0;
  const pendingCommands: string[] = [];

  function setInputValue(value: string): void {
    inputBox.setValue(value);
    assistBox.setContent(renderSuggestionsContent(value));
    screen.render();
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
    transportBox.setContent(renderTransportContent(context));
    executionBox.setContent(await renderExecutionContent(context));
    assistBox.setContent(renderSuggestionsContent(inputBox.getValue()));
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
      const result = await executeCliInput(line, context, state);
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
      assistBox.setContent(renderSuggestionsContent(""));
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
    assistBox.setContent(renderSuggestionsContent(""));
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
    assistBox.setContent(renderSuggestionsContent(inputBox.getValue()));
    screen.render();
  });

  screen.key(["q", "C-c"], () => {
    screen.destroy();
  });
  screen.key(["escape"], () => {
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
  screen.key(["pageup"], () => {
    activity.scroll(-8);
    screen.render();
  });
  screen.key(["pagedown"], () => {
    activity.scroll(8);
    screen.render();
  });

  const hotkeys: Array<[string[], string]> = [
    [["f2"], "/status"],
    [["f3"], "/tools summary"],
    [["f4"], "/delegate overview"],
    [["f5"], "/gateway readiness"],
    [["f6"], "/sessions list"],
    [["f7"], "/doctor"],
    [["f8"], "/runtime plugins"],
  ];

  for (const [keys, command] of hotkeys) {
    screen.key(keys, () => {
      queueCommand(command);
    });
  }

  const refreshTimer = setInterval(() => {
    void refreshPanels();
  }, 4_000);

  appendActivity(
    "boot",
    `${context.config.agentName} TUI online. Type /help for shortcuts and examples.`,
    "success",
  );
  appendActivity(
    "tip",
    "Use Tab for command completion, F5 for transport readiness, and watch the live transport rail for gateway activity.",
    "info",
  );
  response.setContent(
    "{bold}Operator Cockpit Ready{/}\n\nUse the right rail for runtime, transport, execution, and command assist.\nTry /help, /gateway readiness, /execution status, /browser capture <url>, or /delegate overview.",
  );
  transportBox.setContent(renderTransportContent(context));
  executionBox.setContent(await renderExecutionContent(context));
  assistBox.setContent(renderSuggestionsContent(""));

  await refreshPanels();
  inputBox.focus();
  screen.render();

  await new Promise<void>((resolve) => {
    screen.on("destroy", () => {
      clearInterval(refreshTimer);
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
