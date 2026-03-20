import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import blessed from "blessed";
import type { AppContext } from "@/runtime/bootstrap";
import { handleAgentTurn } from "@/runtime/chat";
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

function renderCommandPalette(): string {
  return [
    "{bold}Quick Launch{/}",
    "F2  status",
    "F3  tools summary",
    "F4  delegate overview",
    "F5  gateway readiness",
    "F6  sessions list",
    "F7  doctor",
    "F8  runtime plugins",
    "",
    "{bold}Flow{/}",
    "Esc  focus input",
    "Ctrl-R refresh",
    "Ctrl-L clear feed",
    "PgUp/PgDn scroll",
    "",
    "{bold}Power Commands{/}",
    "/browser capture <url>",
    "/media generate <prompt>",
    "/delegate supervise ...",
    "/trajectories ingest gateway",
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
    height: "55%",
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

  blessed.box({
    parent: screen,
    top: "55%+3",
    left: "68%",
    width: "32%",
    height: "15%-1",
    label: " Hotkeys ",
    tags: true,
    border: "line",
    padding: {
      left: 1,
      right: 1,
    },
    style: {
      border: { fg: "yellow" },
      label: { fg: "yellow", bold: true },
    },
    content: renderCommandPalette(),
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
    "Use F3 for tool inventory, F5 for gateway readiness, and F8 for native plugin visibility.",
    "info",
  );

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
