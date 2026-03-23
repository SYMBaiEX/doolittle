#!/usr/bin/env bun

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, hostname, platform, release } from "node:os";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { normalizeCloudSiteUrl } from "@elizaos/autonomous/cloud/base-url";
import { checkCloudAvailability } from "@elizaos/autonomous/runtime/cloud-onboarding";
import blessed from "blessed";
import {
  getLinkedProviderAccountsSnapshot,
  type LinkedProviderAccountsSnapshot,
} from "../packages/agent/src/runtime/native/account-auth";
import {
  DEFAULT_TUI_THEME,
  getReadableTextColor,
  getTuiTheme,
  listTuiThemes,
  type TuiThemeName,
} from "../packages/agent/src/runtime/theme-catalog";
import {
  RUN_DEPTH_ITERATION_PRESETS,
  type RunDepth,
  type ToolProgressMode,
} from "../packages/agent/src/types";

type ExecutionBackendName =
  | "local"
  | "docker"
  | "podman"
  | "ssh"
  | "singularity"
  | "daytona"
  | "modal";

const IS_MACOS = platform() === "darwin";

function macAwareInstallerKeyLabel(label: string): string {
  if (!IS_MACOS) {
    return label;
  }
  return label
    .replaceAll("Alt-", "Option-")
    .replaceAll("Alt", "Option")
    .replaceAll("Ctrl-", "Control-")
    .replaceAll("Ctrl", "Control");
}

type PairingMode = "pair" | "allow" | "deny";

type WizardMode = "quick" | "ritual";
type ProviderMode =
  | "elizacloud"
  | "openai"
  | "anthropic"
  | "codex"
  | "claude-code"
  | "hybrid"
  | "offline";
type BrowserMode = "lightpanda" | "basic";
type TransportName =
  | "telegram"
  | "discord"
  | "slack"
  | "whatsapp"
  | "signal"
  | "matrix"
  | "email"
  | "sms"
  | "mattermost"
  | "homeassistant"
  | "dingtalk";

interface RuntimeSettings {
  model: {
    provider: string;
    model: string;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
  };
  gateway: {
    sessionTimeoutMinutes: number;
    mirrorResponsesToHistory: boolean;
  };
  execution: {
    backend: ExecutionBackendName;
    remoteSyncMode: "mirror" | "snapshot";
    remoteSyncInclude: string[];
    remoteSyncExclude: string[];
    remoteArtifactPaths: string[];
    remoteArtifactPolicy: "metadata-only" | "allowlisted";
    remoteWorkspaceLabel: string;
    dockerImage: string;
    dockerNetwork: string;
    dockerWorkspacePath: string;
    dockerEnvPassthrough: string[];
    singularityImage: string;
    daytonaTarget: string;
    daytonaCommand: string;
    daytonaShell: string;
    daytonaWorkspacePath: string;
    daytonaSnapshot: string;
    daytonaBootstrapCommand: string;
    daytonaStatusCommand: string;
    daytonaInspectCommand: string;
    modalTarget: string;
    modalCommand: string;
    modalShell: string;
    modalWorkspacePath: string;
    modalEnvironment: string;
    modalBootstrapCommand: string;
    modalStatusCommand: string;
    modalInspectCommand: string;
    commandTimeoutMs: number;
    healthTimeoutMs: number;
    containerCpuLimit: string;
    containerMemoryLimit: string;
    containerPidsLimit: number;
    containerReadOnlyRoot: boolean;
    sshHost: string;
    sshUser: string;
    sshPath: string;
    sshPort: number;
    sshKeyPath: string;
    sshStrictHostKeyChecking: boolean;
  };
  mcp: {
    serverCommand: string;
    timeoutMs: number;
  };
  agent: {
    runDepth: RunDepth;
    maxIterations: number;
    toolProgressMode: ToolProgressMode;
  };
  ui: {
    theme: TuiThemeName;
  };
}

interface GatewayPlatformConfig {
  enabled: boolean;
  allowedUserIds: string[];
  pairingMode: PairingMode;
  allowAllUsers?: boolean;
}

interface GatewayConfig {
  allowAllUsers: boolean;
  sessionTimeoutMinutes: number;
  mirrorResponsesToHistory: boolean;
  platforms: Record<string, GatewayPlatformConfig>;
}

interface OnboardingSummary {
  timestamp: string;
  mode: WizardMode | "headless";
  theme: TuiThemeName;
  provider: ProviderMode;
  accounts: {
    elizaCloudLinked: boolean;
    codexLinked: boolean;
    claudeCodeLinked: boolean;
  };
  backend: ExecutionBackendName;
  browser: BrowserMode;
  agent: {
    runDepth: RunDepth;
    maxIterations: number;
    toolProgressMode: ToolProgressMode;
  };
  transports: TransportName[];
  tools: {
    mcp: boolean;
    acp: boolean;
    tts: boolean;
    codegen: boolean;
  };
  profile: string;
}

interface BootstrapOptions {
  checkOnly: boolean;
  headless: boolean;
  skipWizard: boolean;
  yes: boolean;
}

interface DependencyProbe {
  key: string;
  label: string;
  installed: boolean;
  detail: string;
  recommendation?: string;
}

interface WizardAnswers {
  mode: WizardMode;
  agentName: string;
  timezone: string;
  theme: TuiThemeName;
  provider: ProviderMode;
  backend: ExecutionBackendName;
  browser: BrowserMode;
  runDepth: RunDepth;
  maxIterations: number;
  toolProgressMode: ToolProgressMode;
  pairingMode: PairingMode;
  allowAllUsers: boolean;
  transports: TransportName[];
  tools: {
    mcp: boolean;
    acp: boolean;
    tts: boolean;
    codegen: boolean;
  };
  openaiApiKey: string;
  useLinkedCodexAuth: boolean;
  openaiModel: string;
  elizaCloudApiKey: string;
  elizaCloudEnabled: boolean;
  elizaCloudModel: string;
  anthropicApiKey: string;
  useLinkedClaudeCodeAuth: boolean;
  claudeCodeCliFallback: boolean;
  claudeCodeOauthToken: string;
  anthropicModel: string;
  telegramBotToken: string;
  discordBotToken: string;
  slackWebhookUrl: string;
  slackSigningSecret: string;
  homeAssistantUrl: string;
  homeAssistantToken: string;
  mcpServerCommand: string;
  acpServerCommand: string;
  falApiKey: string;
  e2bApiKey: string;
  githubToken: string;
  sshHost: string;
  sshUser: string;
  sshPath: string;
  daytonaTarget: string;
  modalTarget: string;
}

interface ReviewResult {
  answers: WizardAnswers;
  notices: string[];
}

const root = process.cwd();
const args = process.argv.slice(2);
const options: BootstrapOptions = {
  checkOnly: args.includes("--check"),
  headless:
    args.includes("--headless") ||
    args.includes("--non-interactive") ||
    !input.isTTY ||
    !output.isTTY,
  skipWizard: args.includes("--skip-wizard"),
  yes: args.includes("--yes"),
};

const directories = [
  ".eliza-agent",
  ".eliza-agent/cron-output",
  ".eliza-agent/gateway",
  ".eliza-agent/hooks",
  ".eliza-agent/remote-artifacts",
  ".eliza-agent/trajectories",
  "packages/skills/generated",
  "packages/skill-packs-optional/generated",
];

const envPath = join(root, ".env");
const envExamplePath = join(root, ".env.example");
const settingsPath = join(root, ".eliza-agent", "settings.json");
const gatewayPath = join(root, ".eliza-agent", "gateway", "gateway.json");
const onboardingPath = join(root, ".eliza-agent", "onboarding.json");

const color = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  orange: "\u001b[38;2;255;106;0m",
  amber: "\u001b[38;2;255;176;0m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  magenta: "\u001b[35m",
  red: "\u001b[31m",
};

const wizardSectionOrder = [
  "Preflight",
  "Awakening",
  "Face",
  "Mind",
  "Threads",
  "Codex Bond",
  "Claude Bond",
  "Body",
  "Channels",
  "Hands",
  "First Pulse",
] as const;

type WizardSnapshot = {
  title: string;
  subtitle: string;
  currentSection: string;
  currentDetail: string;
  logLines: string[];
};

type WizardScreenContext = {
  setSection: (title: string, detail?: string) => void;
  appendLine: (message: string) => void;
  promptText: (
    prompt: string,
    defaultValue?: string,
    options?: { secret?: boolean },
  ) => Promise<string>;
  promptYesNo: (prompt: string, defaultValue: boolean) => Promise<boolean>;
  selectOne: <T extends string>(
    prompt: string,
    optionsList: Array<{ value: T; label: string; detail?: string }>,
    defaultValue: T,
    options?: { onHighlight?: (value: T) => void },
  ) => Promise<T>;
  selectMany: <T extends string>(
    prompt: string,
    optionsList: Array<{ value: T; label: string }>,
    defaults: T[],
  ) => Promise<T[]>;
  previewTheme: (theme: TuiThemeName) => void;
  snapshot: () => WizardSnapshot;
  destroy: () => void;
};

let wizardScreen: WizardScreenContext | null = null;

function normalizeElizaCloudModel(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "anthropic/claude-sonnet-4.6";
  }
  const normalized = trimmed.toLowerCase();
  if (normalized === "openai/gpt-5" || normalized === "openai/gpt-5-mini") {
    return "anthropic/claude-sonnet-4.6";
  }
  return trimmed;
}

function requireReadline(
  rl: ReturnType<typeof createInterface> | null,
): ReturnType<typeof createInterface> {
  if (!rl) {
    throw new Error("Interactive readline is unavailable.");
  }
  return rl;
}

function paint(value: string, tone: string): string {
  return `${tone}${value}${color.reset}`;
}

function section(title: string, detail?: string): void {
  if (wizardScreen) {
    wizardScreen.setSection(title, detail);
    return;
  }
  console.log();
  console.log(paint(`◆ ${title}`, color.orange + color.bold));
  if (detail) {
    console.log(paint(`  ${detail}`, color.dim));
  }
}

function info(message: string): void {
  if (wizardScreen) {
    wizardScreen.appendLine(message);
    return;
  }
  console.log(paint(`  ${message}`, color.dim));
}

function warn(message: string): void {
  if (wizardScreen) {
    wizardScreen.appendLine(`WARNING: ${message}`);
    return;
  }
  console.log(paint(`  ⚠ ${message}`, color.amber));
}

function banner(): void {
  if (wizardScreen) {
    return;
  }
  console.log(
    [
      paint(
        "╔══════════════════════════════════════════════════════════════╗",
        color.orange,
      ),
      paint(
        "║                     ELIZA AGENT // AWAKENING               ║",
        color.orange + color.bold,
      ),
      paint(
        "║        Bun-first onboarding for the ElizaOS alpha stack    ║",
        color.orange,
      ),
      paint(
        "╚══════════════════════════════════════════════════════════════╝",
        color.orange,
      ),
      paint(
        "  A first-contact ritual for shaping a mind, a body, and a presence.",
        color.dim,
      ),
    ].join("\n"),
  );
}

function createWizardScreen(
  initial?: Partial<WizardSnapshot>,
): WizardScreenContext {
  const MIN_COLS = 88;
  const MIN_ROWS = 28;
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: "Eliza Agent // Awakening",
    dockBorders: true,
    grabKeys: true,
    mouse: true,
  });
  const snapshot: WizardSnapshot = {
    title: "ELIZA AGENT // AWAKENING",
    subtitle:
      "A first-contact ritual for shaping a mind, a body, and a presence.",
    currentSection: initial?.currentSection || "Preflight",
    currentDetail:
      initial?.currentDetail || "I checked the machine before waking fully.",
    logLines: initial?.logLines ? [...initial.logLines] : [],
  };
  const chromeTop = 4;
  let activeThemeName = DEFAULT_TUI_THEME;
  let footerContent = ` ↑/↓ move  Enter confirm  Space toggle  Esc keep current  ${macAwareInstallerKeyLabel("Ctrl-T")} next theme  ${macAwareInstallerKeyLabel("Ctrl-Y")} previous theme  ${macAwareInstallerKeyLabel("Ctrl-C")} exit `;
  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: chromeTop,
    tags: true,
    style: {
      fg: "white",
      bg: "#ff6a00",
    },
    content: "",
    padding: { left: 1, right: 1 },
  });
  const sidebar = blessed.box({
    parent: screen,
    top: chromeTop,
    left: 0,
    width: 24,
    bottom: 1,
    border: "line",
    label: " Ritual Stages ",
    tags: true,
    padding: { left: 1, right: 1 },
    style: {
      border: { fg: "#ff6a00" },
      fg: "white",
      bg: "#202833",
    },
    content: "",
  });
  const detail = blessed.box({
    parent: screen,
    top: chromeTop,
    left: 24,
    width: "100%-24",
    height: 6,
    border: "line",
    label: " Current Pulse ",
    tags: true,
    padding: { left: 1, right: 1 },
    style: {
      border: { fg: "#55d6ff" },
      fg: "white",
      bg: "#202833",
    },
    content: "",
  });
  const logBox = blessed.box({
    parent: screen,
    top: chromeTop + 6,
    left: 24,
    width: "100%-24",
    bottom: 1,
    border: "line",
    label: " Setup Feed ",
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: " ",
      style: { bg: "#3b4757" },
      track: { bg: "#202833" },
    },
    padding: { left: 1, right: 1 },
    style: {
      border: { fg: "#4fd17d" },
      fg: "white",
      bg: "#202833",
    },
    content: "",
  });
  const _footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: {
      fg: "#9dd7ff",
      bg: "#151c24",
    },
    content: footerContent,
  });

  const setFooter = (content: string) => {
    footerContent = content;
    _footer.setContent(content);
    screen.render();
  };

  const applyTheme = (themeName: TuiThemeName) => {
    activeThemeName = themeName;
    const theme = getTuiTheme(themeName);
    const primaryFg = getReadableTextColor(
      theme.primary,
      theme.baseFg,
      "black",
    );
    const secondaryFg = getReadableTextColor(
      theme.secondary,
      theme.baseFg,
      "black",
    );
    header.style.fg = primaryFg;
    header.style.bg = theme.primary;
    sidebar.style.border = { fg: theme.primary };
    sidebar.style.fg = theme.baseFg;
    sidebar.style.bg = theme.panelBg;
    detail.style.border = { fg: theme.cyanGlow };
    detail.style.fg = theme.baseFg;
    detail.style.bg = theme.panelBg;
    logBox.style.border = { fg: theme.greenGlow };
    logBox.style.fg = theme.baseFg;
    logBox.style.bg = theme.panelBg;
    logBox.style.scrollbar = {
      fg: theme.cyanGlow,
      bg: theme.panelBg,
    };
    _footer.style.fg = theme.cyanGlow;
    _footer.style.bg = theme.baseBg;
    setFooter(
      ` ↑/↓ move  Enter confirm  Space toggle  Esc keep current  Theme preview ${theme.label}  Highlight ${secondaryFg === "black" ? "dark" : "light"} text  ${macAwareInstallerKeyLabel("Ctrl-T/Y")} cycle `,
    );
  };
  applyTheme(DEFAULT_TUI_THEME);

  const render = () => {
    const theme = getTuiTheme(activeThemeName);
    const tooSmall =
      (screen.width as number) < MIN_COLS ||
      (screen.height as number) < MIN_ROWS;
    header.setContent(
      `{bold}${snapshot.title}{/bold}\n${snapshot.subtitle}\n{gray-fg}Theme:{/gray-fg} ${theme.label} · ${theme.tagline}`,
    );
    sidebar.setContent(
      wizardSectionOrder
        .map((name) =>
          name === snapshot.currentSection
            ? `{bold}{${getReadableTextColor(theme.secondary, theme.baseFg, "black")}-fg}› ${name}{/}{/bold}`
            : `  ${name}`,
        )
        .join("\n"),
    );
    detail.setContent(
      tooSmall
        ? `{bold}Terminal Too Small{/bold}\nResize to at least ${MIN_COLS}×${MIN_ROWS} for the fullscreen ritual. Press Ctrl-C to exit or resize to continue.`
        : `{bold}${snapshot.currentSection}{/bold}\n${snapshot.currentDetail}`,
    );
    logBox.setContent(
      tooSmall
        ? snapshot.logLines
            .slice(-8)
            .concat([
              `WARNING: fullscreen ritual needs ${MIN_COLS}×${MIN_ROWS}; current terminal is ${screen.width as number}×${screen.height as number}.`,
            ])
            .join("\n")
        : snapshot.logLines.join("\n"),
    );
    if (!tooSmall) {
      logBox.setScrollPerc(100);
    }
    screen.render();
  };
  screen.on("resize", render);
  screen.on("warning", (warning) => {
    appendLine(`WARNING: ${String(warning)}`);
  });

  const appendLine = (message: string) => {
    snapshot.logLines.push(message);
    if (snapshot.logLines.length > 200) {
      snapshot.logLines.splice(0, snapshot.logLines.length - 200);
    }
    render();
  };

  const setSection = (title: string, detailText?: string) => {
    snapshot.currentSection = title;
    snapshot.currentDetail = detailText || "";
    appendLine(`◆ ${title}${detailText ? ` — ${detailText}` : ""}`);
  };

  const showOverlay = <T>(
    title: string,
    body: string,
    mount: (
      box: blessed.Widgets.BoxElement,
      resolve: (value: T) => void,
    ) => void,
  ): Promise<T> =>
    new Promise((resolve) => {
      let settled = false;
      const settle = (value: T) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      };
      const overlay = blessed.box({
        parent: screen,
        top: "center",
        left: "center",
        width: "72%",
        height: "70%",
        border: "line",
        label: ` ${title} `,
        tags: true,
        padding: { top: 1, left: 1, right: 1, bottom: 1 },
        style: {
          border: { fg: "#ffb000" },
          fg: "white",
          bg: "#151c24",
        },
      });
      blessed.box({
        parent: overlay,
        top: 0,
        left: 0,
        width: "100%-2",
        height: 3,
        tags: true,
        content: body,
      });
      mount(overlay, (value) => {
        overlay.destroy();
        applyTheme(activeThemeName);
        render();
        settle(value);
      });
      render();
    });

  const promptText = async (
    prompt: string,
    defaultValue = "",
    options?: { secret?: boolean },
  ): Promise<string> =>
    showOverlay<string>(
      "Input",
      `${prompt}\n{gray-fg}${defaultValue ? `Default: ${options?.secret ? "[stored]" : defaultValue}` : "Enter to keep current"}{/gray-fg}`,
      (overlay, resolve) => {
        const inputBox = blessed.textbox({
          parent: overlay,
          top: 4,
          left: 0,
          width: "100%-2",
          height: 3,
          border: "line",
          inputOnFocus: true,
          censor: options?.secret ?? false,
          keys: true,
          vi: true,
          mouse: true,
          style: {
            border: { fg: "#55d6ff" },
            fg: "white",
            bg: "#202833",
          },
          value: defaultValue,
        });
        blessed.box({
          parent: overlay,
          bottom: 0,
          left: 0,
          width: "100%-2",
          height: 1,
          tags: true,
          content: "{gray-fg}Enter save · Esc keep current{/gray-fg}",
        });
        setFooter(
          ` Type and press Enter to save  |  Esc keeps current  |  ${macAwareInstallerKeyLabel("Ctrl-C")} exits `,
        );
        let settled = false;
        const finish = (value: string) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve((String(value || "").trim() || defaultValue).trim());
        };
        inputBox.setValue(defaultValue);
        inputBox.on("submit", (value) => {
          finish(String(value ?? inputBox.getValue()));
        });
        inputBox.once("cancel", () => finish(defaultValue));
        inputBox.key(["enter", "return"], () => inputBox.submit());
        inputBox.key(["escape", "C-c"], () => inputBox.cancel());
        inputBox.focus();
        screen.render();
        inputBox.readInput();
      },
    );

  const promptYesNo = async (
    prompt: string,
    defaultValue: boolean,
  ): Promise<boolean> =>
    showOverlay<boolean>(
      "Confirm",
      `${prompt}\n{gray-fg}Enter confirms · Esc keeps default{/gray-fg}`,
      (overlay, resolve) => {
        const list = blessed.list({
          parent: overlay,
          top: 4,
          left: 0,
          width: "100%-2",
          height: 6,
          border: "line",
          keys: true,
          vi: true,
          mouse: true,
          style: {
            border: { fg: "#55d6ff" },
            selected: {
              bg: getTuiTheme(activeThemeName).primary,
              fg: getReadableTextColor(
                getTuiTheme(activeThemeName).primary,
                "white",
                "black",
              ),
            },
            item: { fg: "white" },
          },
          items: [
            `Yes${defaultValue ? " (default)" : ""}`,
            `No${!defaultValue ? " (default)" : ""}`,
          ],
        });
        let settled = false;
        let selectedIndex = defaultValue ? 0 : 1;
        const finish = (value: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(value);
        };
        const applySelection = (index: number) => {
          selectedIndex = Math.max(0, Math.min(1, index));
          list.select(selectedIndex);
          screen.render();
        };
        list.focus();
        applySelection(selectedIndex);
        setFooter(
          " ↑/↓ move  |  Enter or Space confirm  |  Esc keeps current ",
        );
        list.key(["up", "left"], () => applySelection(selectedIndex - 1));
        list.key(["down", "right"], () => applySelection(selectedIndex + 1));
        list.key(["1", "2"], (_ch, key) => {
          const raw = Number(key.full);
          if (Number.isInteger(raw) && raw >= 1 && raw <= 2) {
            applySelection(raw - 1);
          }
        });
        list.key(["enter", "space"], () => finish(selectedIndex === 0));
        list.key("escape", () => finish(defaultValue));
        list.key("C-c", () => finish(defaultValue));
      },
    );

  const selectOne = async <T extends string>(
    prompt: string,
    optionsList: Array<{ value: T; label: string; detail?: string }>,
    defaultValue: T,
    options?: { onHighlight?: (value: T) => void },
  ): Promise<T> =>
    showOverlay<T>(
      "Choose One",
      `${prompt}\n{gray-fg}↑/↓ move · Enter confirm · Esc keep current{/gray-fg}`,
      (overlay, resolve) => {
        const detailBox = blessed.box({
          parent: overlay,
          top: 4,
          left: "60%",
          width: "40%-2",
          height: "100%-8",
          border: "line",
          label: " Detail ",
          padding: { left: 1, right: 1 },
          style: { border: { fg: "#4fd17d" }, fg: "white" },
        });
        const list = blessed.list({
          parent: overlay,
          top: 4,
          left: 0,
          width: "60%",
          height: "100%-8",
          border: "line",
          keys: true,
          vi: true,
          mouse: true,
          style: {
            border: { fg: "#55d6ff" },
            selected: {
              bg: getTuiTheme(activeThemeName).primary,
              fg: getReadableTextColor(
                getTuiTheme(activeThemeName).primary,
                "white",
                "black",
              ),
            },
            item: { fg: "white" },
          },
          items: optionsList.map((item) => item.label),
        });
        let selectedIndex = Math.max(
          0,
          optionsList.findIndex((item) => item.value === defaultValue),
        );
        let settled = false;
        const finish = (index: number) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(optionsList[index]?.value ?? defaultValue);
        };
        const clampIndex = (index: number) =>
          optionsList.length === 0
            ? 0
            : Math.max(0, Math.min(optionsList.length - 1, index));
        const updateDetail = () => {
          selectedIndex = clampIndex(selectedIndex);
          const current = optionsList[selectedIndex];
          if (current) {
            options?.onHighlight?.(current.value);
          }
          detailBox.setContent(
            `${current?.label || ""}\n\n${current?.detail || "No extra detail."}`,
          );
          list.select(selectedIndex);
          screen.render();
        };
        list.focus();
        screen.render();
        updateDetail();
        setFooter(
          " ↑/↓ move  |  Enter or Space confirm  |  Esc keeps current ",
        );
        list.key(["up", "left"], () => {
          selectedIndex = clampIndex(selectedIndex - 1);
          updateDetail();
        });
        list.key(["down", "right"], () => {
          selectedIndex = clampIndex(selectedIndex + 1);
          updateDetail();
        });
        list.key(
          optionsList.map((_item, index) => String(index + 1)),
          (_ch, key) => {
            const numeric = Number(key.full);
            if (
              Number.isInteger(numeric) &&
              numeric >= 1 &&
              numeric <= optionsList.length
            ) {
              selectedIndex = numeric - 1;
              updateDetail();
            }
          },
        );
        list.key(["enter", "space"], () => finish(selectedIndex));
        list.key("escape", () => finish(clampIndex(selectedIndex)));
        list.key("C-c", () => finish(clampIndex(selectedIndex)));
      },
    );

  const selectMany = async <T extends string>(
    prompt: string,
    optionsList: Array<{ value: T; label: string }>,
    defaults: T[],
  ): Promise<T[]> =>
    showOverlay<T[]>(
      "Choose Many",
      `${prompt}\n{gray-fg}↑/↓ move · Space toggle · Enter confirm{/gray-fg}`,
      (overlay, resolve) => {
        const active = new Set(defaults);
        let cursorIndex = 0;
        const list = blessed.list({
          parent: overlay,
          top: 4,
          left: 0,
          width: "100%-2",
          height: "100%-8",
          border: "line",
          keys: true,
          vi: true,
          mouse: true,
          style: {
            border: { fg: "#55d6ff" },
            selected: {
              bg: getTuiTheme(activeThemeName).primary,
              fg: getReadableTextColor(
                getTuiTheme(activeThemeName).primary,
                "white",
                "black",
              ),
            },
            item: { fg: "white" },
          },
          items: [],
        });
        let settled = false;
        const finish = (value: T[]) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(value);
        };
        const clampIndex = (index: number) =>
          optionsList.length === 0
            ? 0
            : Math.max(0, Math.min(optionsList.length - 1, index));
        const refresh = () => {
          cursorIndex = clampIndex(cursorIndex);
          list.setItems(
            optionsList.map(
              (item) => `${active.has(item.value) ? "●" : "○"} ${item.label}`,
            ),
          );
          list.select(cursorIndex);
          screen.render();
        };
        const moveCursor = (delta: number) => {
          cursorIndex = clampIndex(cursorIndex + delta);
          refresh();
        };
        list.focus();
        refresh();
        setFooter(
          " ↑/↓ move  |  Space toggle  |  Enter confirm  |  Esc keeps current ",
        );
        list.on("select item", (_item, index) => {
          cursorIndex = clampIndex(index);
          refresh();
        });
        list.key(["up", "left"], () => moveCursor(-1));
        list.key(["down", "right"], () => moveCursor(1));
        list.key(
          optionsList.map((_item, index) => String(index + 1)),
          (_ch, key) => {
            const numeric = Number(key.full);
            if (
              Number.isInteger(numeric) &&
              numeric >= 1 &&
              numeric <= optionsList.length
            ) {
              cursorIndex = numeric - 1;
              const current = optionsList[cursorIndex];
              if (current) {
                if (active.has(current.value)) {
                  active.delete(current.value);
                } else {
                  active.add(current.value);
                }
              }
              refresh();
            }
          },
        );
        list.key("space", () => {
          const current = optionsList[cursorIndex];
          if (!current) {
            return;
          }
          if (active.has(current.value)) {
            active.delete(current.value);
          } else {
            active.add(current.value);
          }
          refresh();
        });
        list.key("enter", () =>
          finish(
            optionsList
              .filter((item) => active.has(item.value))
              .map((item) => item.value),
          ),
        );
        list.key("escape", () => finish(defaults));
        list.key("C-c", () => finish(defaults));
      },
    );

  screen.key(["C-c"], () => {
    screen.destroy();
    process.exit(1);
  });

  render();

  return {
    setSection,
    appendLine,
    promptText,
    promptYesNo,
    selectOne,
    selectMany,
    previewTheme: (theme: TuiThemeName) => {
      applyTheme(theme);
      render();
    },
    snapshot: () => ({
      title: snapshot.title,
      subtitle: snapshot.subtitle,
      currentSection: snapshot.currentSection,
      currentDetail: snapshot.currentDetail,
      logLines: [...snapshot.logLines],
    }),
    destroy: () => screen.destroy(),
  };
}

function commandExists(command: string): boolean {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function hasPackage(path: string): boolean {
  return existsSync(join(root, "node_modules", ...path.split("/")));
}

function getDependencyProbes(
  existingEnv: Map<string, string>,
): DependencyProbe[] {
  const browserCommand =
    existingEnv.get("ELIZA_AGENT_BROWSER_COMMAND") || "lightpanda";
  const accounts = getLinkedProviderAccountsSnapshot();
  const codexNativeReady =
    accounts.codex.nativeReady === true || accounts.codex.reusable === true;
  const claudeNativeReady =
    accounts.claudeCode.nativeReady === true ||
    accounts.claudeCode.reusable === true;
  return [
    {
      key: "host",
      label: "Host system",
      installed: true,
      detail: `${platform()} ${release()} · ${arch()} · ${hostname()}`,
      recommendation:
        platform() === "darwin"
          ? "macOS detected. I will favor zsh-friendly paths and local app-style defaults."
          : undefined,
    },
    {
      key: "bun",
      label: "Bun runtime",
      installed: commandExists("bun"),
      detail: "Required for install, build, and runtime entrypoints.",
    },
    {
      key: "git",
      label: "Git",
      installed: commandExists("git"),
      detail: "Used by repository workflows, codegen, and status tooling.",
    },
    {
      key: "docker",
      label: "Docker",
      installed: commandExists("docker"),
      detail: "Container execution backend.",
      recommendation: "Install Docker Desktop or switch execution to Local.",
    },
    {
      key: "podman",
      label: "Podman",
      installed: commandExists("podman"),
      detail: "Rootless container execution backend.",
      recommendation: "Install Podman or choose a different body.",
    },
    {
      key: "ssh",
      label: "SSH",
      installed: commandExists("ssh"),
      detail: "Remote execution backend.",
      recommendation: "Install OpenSSH or stay local.",
    },
    {
      key: "daytona",
      label: "Daytona",
      installed: commandExists("daytona"),
      detail: "Cloud workspace backend.",
      recommendation: "Install Daytona CLI before choosing the Daytona body.",
    },
    {
      key: "modal",
      label: "Modal",
      installed: commandExists("modal"),
      detail: "Elastic cloud backend.",
      recommendation: "Install and authenticate the Modal CLI first.",
    },
    {
      key: "lightpanda",
      label: "Lightpanda vision",
      installed: commandExists(browserCommand) || hasPackage("lightpanda"),
      detail: "Preferred browser automation path.",
      recommendation:
        "Install Lightpanda or choose Basic HTTP eyes during onboarding.",
    },
    {
      key: "ffmpeg",
      label: "FFmpeg",
      installed: commandExists("ffmpeg"),
      detail: "Helpful for richer media/audio workflows.",
      recommendation:
        "Install FFmpeg if you want stronger local media processing.",
    },
    {
      key: "codex-auth",
      label: "Codex account",
      installed: codexNativeReady,
      detail: accounts.codex.detail,
      recommendation: codexNativeReady
        ? undefined
        : `Run ${accounts.codex.loginCommand ?? "codex login"} if you want account-linked Codex workflows.`,
    },
    {
      key: "claude-auth",
      label: "Claude Code account",
      installed: claudeNativeReady,
      detail: accounts.claudeCode.detail,
      recommendation: claudeNativeReady
        ? undefined
        : accounts.claudeCode.fallbackReady
          ? `Run ${accounts.claudeCode.setupCommand ?? "claude setup-token"} if you want the full native Claude Code path.`
          : `Run ${accounts.claudeCode.loginCommand ?? "claude auth login"} if you want account-linked Anthropic workflows.`,
    },
  ];
}

function printDependencyProbes(probes: DependencyProbe[]): void {
  section("Preflight", "I checked the machine before waking fully.");
  for (const probe of probes) {
    const state = probe.installed
      ? paint("online", color.green)
      : paint("missing", color.red);
    if (wizardScreen) {
      wizardScreen.appendLine(
        `${probe.label}: ${probe.installed ? "online" : "missing"}`,
      );
    } else {
      console.log(`  ${probe.label}: ${state}`);
    }
    info(probe.detail);
    if (!probe.installed && probe.recommendation) {
      warn(probe.recommendation);
    }
  }
}

function ensureDir(path: string): void {
  if (existsSync(path)) {
    return;
  }
  if (options.checkOnly) {
    return;
  }
  mkdirSync(path, { recursive: true });
}

function ensureEnvFile(): string[] {
  const messages: string[] = [];
  if (existsSync(envPath)) {
    messages.push(".env already exists");
    return messages;
  }

  if (!existsSync(envExamplePath)) {
    messages.push(".env.example is missing");
    return messages;
  }

  if (options.checkOnly) {
    messages.push(".env would be created from .env.example");
    return messages;
  }

  writeFileSync(envPath, readFileSync(envExamplePath, "utf8"), "utf8");
  messages.push(".env created from .env.example");
  return messages;
}

function readEnvEntries(): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(envPath)) {
    return map;
  }
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    map.set(key, value);
  }
  return map;
}

function updateEnvFile(updates: Record<string, string | undefined>): string[] {
  const messages: string[] = [];
  if (!existsSync(envPath)) {
    return [".env is missing"];
  }
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  const seen = new Set<string>();
  const nextLines = lines.map((line) => {
    if (!line || line.trim().startsWith("#")) {
      return line;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      return line;
    }
    const key = line.slice(0, separator).trim();
    if (!(key in updates)) {
      return line;
    }
    seen.add(key);
    const value = updates[key];
    messages.push(`${key} ${value ? "updated" : "cleared"}`);
    return `${key}=${value ?? ""}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) {
      continue;
    }
    nextLines.push(`${key}=${value ?? ""}`);
    messages.push(`${key} added`);
  }

  if (!options.checkOnly) {
    writeFileSync(envPath, nextLines.join("\n"), "utf8");
  }
  return messages;
}

function resolveRunDepth(value?: string | null): RunDepth {
  if (
    value === "quick" ||
    value === "standard" ||
    value === "deep" ||
    value === "explore"
  ) {
    return value;
  }
  return "standard";
}

function resolveToolProgressMode(value?: string | null): ToolProgressMode {
  if (
    value === "off" ||
    value === "new" ||
    value === "all" ||
    value === "verbose"
  ) {
    return value;
  }
  return "new";
}

function resolveMaxIterations(existingEnv: Map<string, string>): number {
  const explicit = Number(existingEnv.get("ELIZA_AGENT_MAX_ITERATIONS") || "");
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  return RUN_DEPTH_ITERATION_PRESETS[
    resolveRunDepth(existingEnv.get("ELIZA_AGENT_RUN_DEPTH"))
  ];
}

function defaultSettings(theme: TuiThemeName): RuntimeSettings {
  return {
    model: {
      provider: "openai",
      model: "gpt-5.4",
      baseUrl: "https://api.openai.com/v1",
      temperature: 0.4,
      maxTokens: 1200,
    },
    gateway: {
      sessionTimeoutMinutes: 120,
      mirrorResponsesToHistory: true,
    },
    execution: {
      backend: "local",
      remoteSyncMode: "mirror",
      remoteSyncInclude: ["**/*"],
      remoteSyncExclude: [
        ".git",
        ".eliza-agent",
        "node_modules",
        "dist",
        "coverage",
        ".cache",
        ".turbo",
        ".DS_Store",
      ],
      remoteArtifactPaths: [
        ".eliza-agent/remote-artifacts",
        ".eliza-agent/trajectories",
        ".eliza-agent/cron-output",
      ],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "eliza-agent-workspace",
      dockerImage: "oven/bun:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: [
        "PATH",
        "HOME",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
      ],
      singularityImage: "",
      daytonaTarget: "",
      daytonaCommand: "",
      daytonaShell: "/bin/sh",
      daytonaWorkspacePath: "/workspace",
      daytonaSnapshot: "",
      daytonaBootstrapCommand: "",
      daytonaStatusCommand: "",
      daytonaInspectCommand: "",
      modalTarget: "",
      modalCommand: "",
      modalShell: "/bin/bash",
      modalWorkspacePath: "/workspace",
      modalEnvironment: "",
      modalBootstrapCommand: "",
      modalStatusCommand: "",
      modalInspectCommand: "",
      commandTimeoutMs: 30_000,
      healthTimeoutMs: 5_000,
      containerCpuLimit: "2",
      containerMemoryLimit: "2g",
      containerPidsLimit: 256,
      containerReadOnlyRoot: true,
      sshHost: "",
      sshUser: "",
      sshPath: "",
      sshPort: 22,
      sshKeyPath: "",
      sshStrictHostKeyChecking: false,
    },
    mcp: {
      serverCommand: "",
      timeoutMs: 10_000,
    },
    agent: {
      runDepth: "standard",
      maxIterations: RUN_DEPTH_ITERATION_PRESETS.standard,
      toolProgressMode: "new",
    },
    ui: {
      theme,
    },
  };
}

function loadSettings(theme: TuiThemeName): RuntimeSettings {
  if (!existsSync(settingsPath)) {
    return defaultSettings(theme);
  }
  try {
    const current = JSON.parse(
      readFileSync(settingsPath, "utf8"),
    ) as RuntimeSettings;
    return {
      ...defaultSettings(theme),
      ...current,
      model: { ...defaultSettings(theme).model, ...current.model },
      gateway: { ...defaultSettings(theme).gateway, ...current.gateway },
      execution: { ...defaultSettings(theme).execution, ...current.execution },
      mcp: { ...defaultSettings(theme).mcp, ...current.mcp },
      agent: { ...defaultSettings(theme).agent, ...current.agent },
      ui: { ...defaultSettings(theme).ui, ...current.ui },
    };
  } catch {
    return defaultSettings(theme);
  }
}

function defaultGatewayConfig(
  allowAllUsers: boolean,
  pairingMode: PairingMode,
): GatewayConfig {
  const platforms = [
    "api",
    "cli",
    "telegram",
    "discord",
    "slack",
    "whatsapp",
    "signal",
    "matrix",
    "email",
    "sms",
    "mattermost",
    "homeassistant",
    "dingtalk",
  ];
  const config: GatewayConfig = {
    allowAllUsers,
    sessionTimeoutMinutes: 120,
    mirrorResponsesToHistory: true,
    platforms: {},
  };

  for (const platform of platforms) {
    config.platforms[platform] = {
      enabled: platform === "api" || platform === "cli",
      allowedUserIds: [],
      pairingMode:
        platform === "api" || platform === "cli" ? "allow" : pairingMode,
      allowAllUsers:
        platform === "api" || platform === "cli" ? true : undefined,
    };
  }

  return config;
}

function loadGatewayConfig(
  allowAllUsers: boolean,
  pairingMode: PairingMode,
): GatewayConfig {
  const defaults = defaultGatewayConfig(allowAllUsers, pairingMode);
  if (!existsSync(gatewayPath)) {
    return defaults;
  }
  try {
    const current = JSON.parse(
      readFileSync(gatewayPath, "utf8"),
    ) as GatewayConfig;
    return {
      ...defaults,
      ...current,
      platforms: {
        ...defaults.platforms,
        ...(current.platforms ?? {}),
      },
    };
  } catch {
    return defaults;
  }
}

function writeJson(path: string, value: unknown): void {
  if (options.checkOnly) {
    return;
  }
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function fingerprint(
  values: Record<string, string | boolean | string[]>,
): string {
  const stable = JSON.stringify(values, Object.keys(values).sort());
  return createHash("sha256").update(stable).digest("hex").slice(0, 12);
}

function summarizeAnswers(answers: WizardAnswers): string[] {
  const model =
    answers.provider === "anthropic" || answers.provider === "claude-code"
      ? answers.anthropicModel
      : answers.provider === "elizacloud"
        ? answers.elizaCloudModel
        : answers.openaiModel;
  return [
    `mind=${answers.provider} model=${model}`,
    `threads=cloud:${answers.elizaCloudApiKey ? "bound" : "idle"} codex:${answers.useLinkedCodexAuth ? "bound" : "idle"} claude:${answers.useLinkedClaudeCodeAuth ? "bound" : "idle"}`,
    `run=${answers.runDepth} cap=${answers.maxIterations} progress=${answers.toolProgressMode}`,
    `body=${answers.backend} eyes=${answers.browser}`,
    `channels=${answers.transports.length ? answers.transports.join(", ") : "api, cli only"}`,
    `tools=${
      [
        answers.tools.mcp ? "mcp" : "",
        answers.tools.acp ? "acp" : "",
        answers.tools.tts ? "tts" : "",
        answers.tools.codegen ? "codegen" : "",
      ]
        .filter(Boolean)
        .join(", ") || "none"
    }`,
    `face=${answers.theme} timezone=${answers.timezone}`,
  ];
}

function finalizeWizardAnswers(
  answers: WizardAnswers,
  linkedAccounts: LinkedProviderAccountsSnapshot,
): ReviewResult {
  const notices: string[] = [];
  const next: WizardAnswers = {
    ...answers,
    tools: { ...answers.tools },
    transports: [...answers.transports],
  };

  const codexReady = Boolean(
    linkedAccounts.codex.nativeReady || linkedAccounts.codex.reusable,
  );
  const claudeReady = Boolean(
    linkedAccounts.claudeCode.nativeReady || linkedAccounts.claudeCode.reusable,
  );
  const cloudReady = Boolean(next.elizaCloudApiKey.trim());

  if (next.provider === "elizacloud" && !cloudReady) {
    next.provider = "offline";
    notices.push(
      "Eliza Cloud is still selected, but no managed cloud key is active yet. I left the mind dormant instead of silently switching you onto another provider.",
    );
  }

  if (
    next.provider === "openai" &&
    !next.openaiApiKey.trim() &&
    !next.useLinkedCodexAuth
  ) {
    if (codexReady) {
      next.provider = "codex";
      next.useLinkedCodexAuth = true;
      next.openaiModel = next.openaiModel || "gpt-5.4";
      notices.push(
        "No OPENAI_API_KEY was provided, so I switched the active mind to linked Codex.",
      );
    } else if (claudeReady) {
      next.provider = "claude-code";
      next.useLinkedClaudeCodeAuth = true;
      next.anthropicModel = next.anthropicModel || "claude-sonnet-4.6";
      notices.push(
        "OpenAI had no key, so I switched the active mind to linked Claude Code instead of leaving you with a silent boot.",
      );
    } else {
      next.provider = "offline";
      notices.push(
        "No OpenAI key or linked account was available, so I left the mind dormant instead of writing a broken provider state.",
      );
    }
  }

  if (
    next.provider === "anthropic" &&
    !next.anthropicApiKey.trim() &&
    !next.useLinkedClaudeCodeAuth
  ) {
    if (claudeReady) {
      next.provider = "claude-code";
      next.useLinkedClaudeCodeAuth = true;
      notices.push(
        "No ANTHROPIC_API_KEY was provided, so I switched the active mind to linked Claude Code.",
      );
    } else {
      next.provider = "offline";
      notices.push(
        "No Anthropic key or linked Claude Code auth was available, so I left the mind dormant instead of writing a broken provider state.",
      );
    }
  }

  if (next.provider === "codex" && !next.useLinkedCodexAuth && !codexReady) {
    if (next.openaiApiKey.trim()) {
      next.provider = "openai";
      notices.push(
        "Codex was selected without linked auth, so I fell back to OpenAI API mode.",
      );
    } else {
      next.provider = "offline";
      notices.push(
        "Codex was selected without linked auth, so I left the mind dormant instead of writing a broken provider state.",
      );
    }
  }

  if (
    next.provider === "claude-code" &&
    !next.useLinkedClaudeCodeAuth &&
    !next.claudeCodeOauthToken.trim() &&
    !next.claudeCodeCliFallback
  ) {
    if (next.anthropicApiKey.trim()) {
      next.provider = "anthropic";
      notices.push(
        "Claude Code was selected without native auth, so I fell back to Anthropic API mode.",
      );
    } else {
      next.provider = "offline";
      notices.push(
        "Claude Code was selected without native auth, so I left the mind dormant instead of writing a broken provider state.",
      );
    }
  }

  if (next.tools.mcp && !next.mcpServerCommand.trim()) {
    next.tools.mcp = false;
    notices.push("MCP stayed disabled because no server command was bound.");
  }

  if (next.tools.acp && !next.acpServerCommand.trim()) {
    next.tools.acp = false;
    notices.push(
      "ACP stayed disabled because no editor binding command was set.",
    );
  }

  if (
    next.tools.codegen &&
    !next.e2bApiKey.trim() &&
    !next.githubToken.trim()
  ) {
    next.tools.codegen = false;
    notices.push(
      "Codegen stayed disabled because neither E2B nor GitHub credentials were provided.",
    );
  }

  const requiredTransportSecrets: Partial<Record<TransportName, boolean>> = {
    telegram: Boolean(next.telegramBotToken.trim()),
    discord: Boolean(next.discordBotToken.trim()),
    slack: Boolean(
      next.slackWebhookUrl.trim() && next.slackSigningSecret.trim(),
    ),
    homeassistant: Boolean(
      next.homeAssistantUrl.trim() && next.homeAssistantToken.trim(),
    ),
  };
  next.transports = next.transports.filter((transport) => {
    if (!(transport in requiredTransportSecrets)) {
      return true;
    }
    const ready = requiredTransportSecrets[transport];
    if (!ready) {
      notices.push(
        `${transport} was deselected because its required credentials were left blank.`,
      );
    }
    return Boolean(ready);
  });

  return { answers: next, notices };
}

async function ask(
  rl: ReturnType<typeof createInterface> | null,
  prompt: string,
  defaultValue = "",
): Promise<string> {
  if (wizardScreen) {
    return wizardScreen.promptText(prompt, defaultValue);
  }
  const promptInterface = requireReadline(rl);
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (
    await promptInterface.question(paint(`${prompt}${suffix}: `, color.amber))
  ).trim();
  return answer || defaultValue;
}

async function askSecret(
  rl: ReturnType<typeof createInterface> | null,
  prompt: string,
  defaultValue = "",
): Promise<string> {
  if (wizardScreen) {
    return wizardScreen.promptText(prompt, defaultValue, { secret: true });
  }
  if (!input.isTTY || !output.isTTY) {
    return ask(rl, prompt, defaultValue);
  }
  const promptInterface = requireReadline(rl);

  const suffix = defaultValue ? " [stored]" : "";
  const previousState = spawnSync("stty", ["-g"], {
    stdio: ["inherit", "pipe", "inherit"],
  })
    .stdout.toString()
    .trim();

  spawnSync("stty", ["-echo"], { stdio: "inherit" });
  try {
    const answer = (
      await promptInterface.question(paint(`${prompt}${suffix}: `, color.amber))
    ).trim();
    output.write("\n");
    return answer || defaultValue;
  } finally {
    if (previousState) {
      spawnSync("stty", [previousState], { stdio: "inherit" });
    } else {
      spawnSync("stty", ["echo"], { stdio: "inherit" });
    }
  }
}

async function askYesNo(
  rl: ReturnType<typeof createInterface> | null,
  prompt: string,
  defaultValue: boolean,
): Promise<boolean> {
  if (wizardScreen) {
    return wizardScreen.promptYesNo(prompt, defaultValue);
  }
  const promptInterface = requireReadline(rl);
  const fallback = defaultValue ? "Y/n" : "y/N";
  while (true) {
    const answer = (
      await promptInterface.question(
        paint(`${prompt} [${fallback}]: `, color.amber),
      )
    )
      .trim()
      .toLowerCase();
    if (!answer) {
      return defaultValue;
    }
    if (answer === "y" || answer === "yes") {
      return true;
    }
    if (answer === "n" || answer === "no") {
      return false;
    }
    warn("Please answer yes or no.");
  }
}

function supportsInteractiveMenus(): boolean {
  return Boolean(input.isTTY && output.isTTY && input.setRawMode);
}

function clearRenderedMenu(lines: number): void {
  if (lines <= 0) {
    return;
  }
  output.write(`\u001b[${lines}F`);
  output.write("\u001b[J");
}

async function readMenuKeypress(): Promise<string> {
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer | string) => {
      cleanup();
      resolve(chunk.toString());
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      input.off("data", onData);
      input.off("error", onError);
    };
    input.on("data", onData);
    input.on("error", onError);
  });
}

async function withRawMenuInput<T>(run: () => Promise<T>): Promise<T> {
  if (!supportsInteractiveMenus()) {
    return run();
  }

  output.write("\u001b[?25l");
  input.setRawMode?.(true);
  input.resume();
  try {
    return await run();
  } finally {
    input.setRawMode?.(false);
    output.write("\u001b[?25h");
  }
}

function runInteractiveCommand(
  command: string,
  args: string[],
  label: string,
): boolean {
  const snapshot = wizardScreen?.snapshot();
  if (wizardScreen) {
    wizardScreen.destroy();
    wizardScreen = null;
    console.log();
  }
  section("Binding", label);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (snapshot) {
    wizardScreen = createWizardScreen(snapshot);
  }
  if (result.error) {
    warn(`${label} failed: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    warn(`${label} exited with code ${result.status ?? "unknown"}.`);
    return false;
  }
  info(`${label} completed.`);
  return true;
}

async function tryOpenBrowser(url: string): Promise<boolean> {
  const isWindows = platform() === "win32";
  const isMac = platform() === "darwin";
  const bin = isMac ? "open" : isWindows ? "cmd" : "xdg-open";
  const args = isWindows ? ["/c", "start", "", url] : [url];

  return await new Promise<boolean>((resolve) => {
    try {
      const child = spawn(bin, args, {
        stdio: "ignore",
        env: process.env,
      });
      child.once("error", () => resolve(false));
      child.once("spawn", () => resolve(true));
      child.unref();
    } catch {
      resolve(false);
    }
  });
}

interface ElizaCloudLoginSession {
  sessionId: string;
  browserUrl: string;
}

interface ElizaCloudLoginPollResult {
  status: string;
  apiKey?: string;
}

async function createElizaCloudLoginSession(
  baseUrl: string,
): Promise<ElizaCloudLoginSession> {
  const siteBase = normalizeCloudSiteUrl(baseUrl);
  const sessionId = crypto.randomUUID();
  const response = await fetch(`${siteBase}/api/auth/cli-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to create auth session (HTTP ${response.status}): ${body || "empty response"}`,
    );
  }

  return {
    sessionId,
    browserUrl: `${siteBase}/auth/cli-login?session=${encodeURIComponent(sessionId)}`,
  };
}

async function pollElizaCloudLoginSession(
  baseUrl: string,
  sessionId: string,
): Promise<ElizaCloudLoginPollResult> {
  const siteBase = normalizeCloudSiteUrl(baseUrl);
  const response = await fetch(
    `${siteBase}/api/auth/cli-session/${encodeURIComponent(sessionId)}`,
    {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (response.status === 404) {
    throw new Error("Auth session expired or not found. Please try again.");
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Cloud login polling failed (HTTP ${response.status}): ${body || "empty response"}`,
    );
  }

  return (await response.json()) as ElizaCloudLoginPollResult;
}

async function runElizaCloudLoginFlow(
  label: string,
  baseUrl = "https://www.elizacloud.ai",
): Promise<string | undefined> {
  const snapshot = wizardScreen?.snapshot();
  if (wizardScreen) {
    wizardScreen.destroy();
    wizardScreen = null;
    console.log();
  }

  try {
    section("Binding", label);
    const availability = await checkCloudAvailability(baseUrl);
    if (availability) {
      const normalizedAvailability = availability.toLowerCase();
      const authGatedAvailability =
        normalizedAvailability.includes("http 401") ||
        normalizedAvailability.includes("http 403");
      if (authGatedAvailability) {
        warn(
          "Eliza Cloud availability probing is auth-gated right now, so I am continuing directly to the login flow instead of treating that probe as a blocker.",
        );
      } else {
        warn(availability);
        return undefined;
      }
    }

    let announcedBrowser = false;
    let lastStatus = "";
    const session = await createElizaCloudLoginSession(baseUrl);

    if (!announcedBrowser) {
      info("Trying to open your browser for Eliza Cloud login.");
      info(
        `If it does not appear, open this URL manually: ${session.browserUrl}`,
      );
      info("I will keep waiting here while the Eliza Cloud login completes.");
      announcedBrowser = true;
      void tryOpenBrowser(session.browserUrl).then((opened) => {
        if (!opened) {
          warn(
            "I could not confirm an automatic browser launch. Use the URL above to continue the Cloud login manually.",
          );
        }
      });
    }

    const deadline = Date.now() + 300_000;
    let apiKey: string | undefined;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const poll = await pollElizaCloudLoginSession(baseUrl, session.sessionId);
      if (poll.status && poll.status !== lastStatus) {
        info(`Eliza Cloud auth: ${poll.status}`);
        lastStatus = poll.status;
      }
      if (poll.status === "authenticated" && poll.apiKey) {
        apiKey = poll.apiKey;
        break;
      }
    }

    if (!apiKey) {
      throw new Error(
        "Cloud login timed out. The browser login was not completed within 300 seconds.",
      );
    }

    info(`${label} completed.`);
    return apiKey;
  } catch (error) {
    warn(
      `${label} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  } finally {
    if (snapshot) {
      wizardScreen = createWizardScreen(snapshot);
    }
  }
}

async function chooseOne<T extends string>(
  rl: ReturnType<typeof createInterface> | null,
  prompt: string,
  optionsList: Array<{ value: T; label: string; detail?: string }>,
  defaultValue: T,
  options?: { onHighlight?: (value: T) => void },
): Promise<T> {
  if (wizardScreen) {
    return wizardScreen.selectOne(prompt, optionsList, defaultValue, options);
  }
  const promptInterface = requireReadline(rl);
  if (supportsInteractiveMenus()) {
    return withRawMenuInput(async () => {
      let selectedIndex = Math.max(
        0,
        optionsList.findIndex((item) => item.value === defaultValue),
      );
      let renderedLines = 0;

      const render = () => {
        clearRenderedMenu(renderedLines);
        options?.onHighlight?.(
          optionsList[selectedIndex]?.value ?? defaultValue,
        );
        const lines = [
          paint(prompt, color.cyan + color.bold),
          paint(
            "Use ↑/↓ to move, Enter to confirm, or press a number key.",
            color.dim,
          ),
        ];
        optionsList.forEach((item, index) => {
          const selected = index === selectedIndex ? "●" : "○";
          lines.push(`  ${selected} ${index + 1}. ${item.label}`);
          if (item.detail) {
            lines.push(`    ${item.detail}`);
          }
        });
        const rendered = `${lines.join("\n")}\n`;
        output.write(rendered);
        renderedLines = rendered.split("\n").length - 1;
      };

      render();
      while (true) {
        const key = await readMenuKeypress();
        if (key === "\u0003") {
          throw new Error("Installer interrupted.");
        }
        if (key === "\r" || key === "\n" || key === " ") {
          clearRenderedMenu(renderedLines);
          return optionsList[selectedIndex]?.value ?? defaultValue;
        }
        if (key === "\u001b[A") {
          selectedIndex =
            selectedIndex === 0 ? optionsList.length - 1 : selectedIndex - 1;
          render();
          continue;
        }
        if (key === "\u001b[B") {
          selectedIndex =
            selectedIndex === optionsList.length - 1 ? 0 : selectedIndex + 1;
          render();
          continue;
        }
        const numeric = Number.parseInt(key, 10);
        if (
          Number.isInteger(numeric) &&
          numeric >= 1 &&
          numeric <= optionsList.length
        ) {
          selectedIndex = numeric - 1;
          render();
        }
      }
    });
  }

  console.log(paint(prompt, color.cyan + color.bold));
  optionsList.forEach((item, index) => {
    const selected = item.value === defaultValue ? "●" : "○";
    console.log(`  ${selected} ${index + 1}. ${item.label}`);
    if (item.detail) {
      info(item.detail);
    }
  });
  while (true) {
    const answer = (
      await promptInterface.question(
        paint(
          `Select [1-${optionsList.length}] (${optionsList.findIndex((item) => item.value === defaultValue) + 1}): `,
          color.amber,
        ),
      )
    ).trim();
    if (!answer) {
      return defaultValue;
    }
    const numeric = Number(answer);
    if (
      Number.isInteger(numeric) &&
      numeric >= 1 &&
      numeric <= optionsList.length
    ) {
      const selected = optionsList[numeric - 1];
      if (selected) {
        return selected.value;
      }
    }
    const direct = optionsList.find((item) => item.value === answer);
    if (direct) {
      return direct.value;
    }
    warn("Pick one of the listed options.");
  }
}

async function chooseMany<T extends string>(
  rl: ReturnType<typeof createInterface> | null,
  prompt: string,
  optionsList: Array<{ value: T; label: string }>,
  defaults: T[],
): Promise<T[]> {
  if (wizardScreen) {
    return wizardScreen.selectMany(prompt, optionsList, defaults);
  }
  const promptInterface = requireReadline(rl);
  if (supportsInteractiveMenus()) {
    return withRawMenuInput(async () => {
      const active = new Set(defaults);
      let cursorIndex = 0;
      let renderedLines = 0;

      const render = () => {
        clearRenderedMenu(renderedLines);
        const lines = [
          paint(prompt, color.cyan + color.bold),
          paint(
            "Use ↑/↓ to move, Space to toggle, Enter to confirm.",
            color.dim,
          ),
        ];
        optionsList.forEach((item, index) => {
          const cursor = index === cursorIndex ? "›" : " ";
          const selected = active.has(item.value) ? "●" : "○";
          lines.push(`  ${cursor} ${selected} ${index + 1}. ${item.label}`);
        });
        const rendered = `${lines.join("\n")}\n`;
        output.write(rendered);
        renderedLines = rendered.split("\n").length - 1;
      };

      render();
      while (true) {
        const key = await readMenuKeypress();
        if (key === "\u0003") {
          throw new Error("Installer interrupted.");
        }
        if (key === "\r" || key === "\n") {
          clearRenderedMenu(renderedLines);
          return optionsList
            .filter((item) => active.has(item.value))
            .map((item) => item.value);
        }
        if (key === " ") {
          const current = optionsList[cursorIndex];
          if (current) {
            if (active.has(current.value)) {
              active.delete(current.value);
            } else {
              active.add(current.value);
            }
          }
          render();
          continue;
        }
        if (key === "\u001b[A") {
          cursorIndex =
            cursorIndex === 0 ? optionsList.length - 1 : cursorIndex - 1;
          render();
          continue;
        }
        if (key === "\u001b[B") {
          cursorIndex =
            cursorIndex === optionsList.length - 1 ? 0 : cursorIndex + 1;
          render();
          continue;
        }
        const numeric = Number.parseInt(key, 10);
        if (
          Number.isInteger(numeric) &&
          numeric >= 1 &&
          numeric <= optionsList.length
        ) {
          cursorIndex = numeric - 1;
          const current = optionsList[cursorIndex];
          if (current) {
            if (active.has(current.value)) {
              active.delete(current.value);
            } else {
              active.add(current.value);
            }
          }
          render();
        }
      }
    });
  }

  console.log(paint(prompt, color.cyan + color.bold));
  optionsList.forEach((item, index) => {
    const selected = defaults.includes(item.value) ? "●" : "○";
    console.log(`  ${selected} ${index + 1}. ${item.label}`);
  });
  info(
    "Use comma-separated numbers like 1,3,5. Leave blank to keep the defaults.",
  );
  while (true) {
    const answer = (
      await promptInterface.question(paint("Select: ", color.amber))
    ).trim();
    if (!answer) {
      return defaults;
    }
    const values = answer
      .split(",")
      .map((entry) => Number(entry.trim()))
      .filter(
        (value) =>
          Number.isInteger(value) && value >= 1 && value <= optionsList.length,
      )
      .map((value) => optionsList[value - 1]?.value)
      .filter((value): value is T => Boolean(value));
    if (values.length > 0) {
      return [...new Set(values)];
    }
    warn("Enter one or more valid option numbers.");
  }
}

function headlessAnswers(existingEnv: Map<string, string>): WizardAnswers {
  const runDepth = resolveRunDepth(existingEnv.get("ELIZA_AGENT_RUN_DEPTH"));
  const toolProgressMode = resolveToolProgressMode(
    existingEnv.get("ELIZA_AGENT_TOOL_PROGRESS"),
  );
  const maxIterations = resolveMaxIterations(existingEnv);
  const provider: ProviderMode =
    existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true"
      ? "elizacloud"
      : existingEnv.get("OPENAI_API_KEY")
        ? existingEnv.get("ANTHROPIC_API_KEY")
          ? "hybrid"
          : "openai"
        : existingEnv.get("ANTHROPIC_API_KEY") ||
            existingEnv.get("CLAUDE_CODE_OAUTH_TOKEN") ||
            existingEnv.get("CLAUDE_CODE_SETUP_TOKEN")
          ? "anthropic"
          : existingEnv.get("ELIZA_AGENT_USE_LINKED_CLAUDE_CODE_AUTH") ===
              "true"
            ? "claude-code"
            : existingEnv.get("ELIZA_AGENT_USE_LINKED_CODEX_AUTH") === "true"
              ? "codex"
              : "offline";
  return {
    mode: "quick",
    agentName: existingEnv.get("ELIZA_AGENT_NAME") || "Eliza Agent",
    timezone: existingEnv.get("ELIZA_AGENT_TIMEZONE") || "America/Chicago",
    theme: DEFAULT_TUI_THEME,
    provider,
    backend:
      (existingEnv.get(
        "ELIZA_AGENT_EXECUTION_BACKEND",
      ) as ExecutionBackendName) || "local",
    browser:
      (existingEnv.get("ELIZA_AGENT_BROWSER_PROVIDER") as BrowserMode) ||
      "lightpanda",
    runDepth,
    maxIterations,
    toolProgressMode,
    pairingMode:
      (existingEnv.get("ELIZA_AGENT_PAIRING_MODE") as PairingMode) || "pair",
    allowAllUsers: existingEnv.get("ELIZA_AGENT_ALLOW_ALL_USERS") === "true",
    transports: [],
    tools: {
      mcp: Boolean(existingEnv.get("MCP_SERVER_COMMAND")),
      acp: Boolean(existingEnv.get("ACP_SERVER_COMMAND")),
      tts: Boolean(existingEnv.get("FAL_API_KEY")),
      codegen: Boolean(
        existingEnv.get("E2B_API_KEY") || existingEnv.get("GITHUB_TOKEN"),
      ),
    },
    openaiApiKey: existingEnv.get("OPENAI_API_KEY") || "",
    useLinkedCodexAuth:
      existingEnv.get("ELIZA_AGENT_USE_LINKED_CODEX_AUTH") === "true",
    openaiModel: existingEnv.get("OPENAI_MODEL") || "gpt-5.4",
    elizaCloudApiKey: existingEnv.get("ELIZAOS_CLOUD_API_KEY") || "",
    elizaCloudEnabled: existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true",
    elizaCloudModel: normalizeElizaCloudModel(
      existingEnv.get("ELIZAOS_CLOUD_LARGE_MODEL"),
    ),
    anthropicApiKey: existingEnv.get("ANTHROPIC_API_KEY") || "",
    useLinkedClaudeCodeAuth:
      existingEnv.get("ELIZA_AGENT_USE_LINKED_CLAUDE_CODE_AUTH") === "true",
    claudeCodeCliFallback:
      existingEnv.get("ELIZA_AGENT_CLAUDE_CODE_CLI_FALLBACK") === "true",
    claudeCodeOauthToken:
      existingEnv.get("CLAUDE_CODE_OAUTH_TOKEN") ||
      existingEnv.get("CLAUDE_CODE_SETUP_TOKEN") ||
      "",
    anthropicModel:
      existingEnv.get("ANTHROPIC_LARGE_MODEL") || "claude-sonnet-4.6",
    telegramBotToken: existingEnv.get("TELEGRAM_BOT_TOKEN") || "",
    discordBotToken: existingEnv.get("DISCORD_BOT_TOKEN") || "",
    slackWebhookUrl: existingEnv.get("SLACK_WEBHOOK_URL") || "",
    slackSigningSecret: existingEnv.get("SLACK_SIGNING_SECRET") || "",
    homeAssistantUrl: existingEnv.get("HOMEASSISTANT_URL") || "",
    homeAssistantToken: existingEnv.get("HOMEASSISTANT_TOKEN") || "",
    mcpServerCommand: existingEnv.get("MCP_SERVER_COMMAND") || "",
    acpServerCommand: existingEnv.get("ACP_SERVER_COMMAND") || "",
    falApiKey: existingEnv.get("FAL_API_KEY") || "",
    e2bApiKey: existingEnv.get("E2B_API_KEY") || "",
    githubToken: existingEnv.get("GITHUB_TOKEN") || "",
    sshHost: existingEnv.get("ELIZA_AGENT_SSH_HOST") || "",
    sshUser: existingEnv.get("ELIZA_AGENT_SSH_USER") || "",
    sshPath: existingEnv.get("ELIZA_AGENT_SSH_PATH") || "",
    daytonaTarget: existingEnv.get("ELIZA_AGENT_DAYTONA_TARGET") || "",
    modalTarget: existingEnv.get("ELIZA_AGENT_MODAL_TARGET") || "",
  };
}

async function runWizard(
  existingEnv: Map<string, string>,
): Promise<WizardAnswers> {
  if (options.headless || options.skipWizard) {
    return headlessAnswers(existingEnv);
  }

  if (input.isTTY && output.isTTY) {
    const cols = typeof output.columns === "number" ? output.columns : 0;
    const rows = typeof output.rows === "number" ? output.rows : 0;
    if (cols >= 96 && rows >= 28) {
      wizardScreen = createWizardScreen();
    } else {
      banner();
      warn(
        `Terminal is ${cols || "unknown"}x${rows || "unknown"}. I’m switching to the line wizard so the setup stays readable.`,
      );
      info(
        "If you want the fullscreen ritual later, expand the terminal and rerun `eliza-agent setup`.",
      );
    }
  }
  banner();
  const dependencyProbes = getDependencyProbes(existingEnv);
  let linkedAccounts = getLinkedProviderAccountsSnapshot();
  printDependencyProbes(dependencyProbes);
  const rl = wizardScreen ? null : createInterface({ input, output });
  try {
    while (true) {
      section("Awakening", "Decide how fully you want me to come online.");
      const mode = await chooseOne<WizardMode>(
        rl,
        "Choose my first form:",
        [
          {
            value: "quick",
            label: "Quick ignition",
            detail:
              "Wake me quickly with the minimum set of high-impact choices.",
          },
          {
            value: "ritual",
            label: "Full awakening",
            detail:
              "Shape my mind, body, channels, tools, and face in one deliberate pass.",
          },
        ],
        "ritual",
      );

      section("Face", "Give me a name, a timezone, and a visible personality.");
      const agentName = await ask(
        rl,
        "What should I answer to",
        existingEnv.get("ELIZA_AGENT_NAME") || "Eliza Agent",
      );
      const timezone = await ask(
        rl,
        "What timezone should shape my days",
        existingEnv.get("ELIZA_AGENT_TIMEZONE") || "America/Chicago",
      );
      const themeChoices = listTuiThemes().map((theme) => ({
        value: theme.name,
        label: `${theme.label} (${theme.name})`,
        detail: [
          theme.tagline,
          theme.aliases.length > 0
            ? `Aliases: ${theme.aliases.join(", ")}`
            : undefined,
          `Preview: ${theme.primary} · ${theme.secondary}`,
        ]
          .filter(Boolean)
          .join(" · "),
      }));
      const theme = await chooseOne<TuiThemeName>(
        rl,
        "Choose the face I wake up in:",
        themeChoices,
        DEFAULT_TUI_THEME,
        {
          onHighlight: (nextTheme) => {
            wizardScreen?.previewTheme(nextTheme);
          },
        },
      );

      section("Mind", "I need a mind to think with.");
      let provider = await chooseOne<ProviderMode>(
        rl,
        "How should I think on day one?",
        [
          {
            value: "elizacloud",
            label: "Eliza Cloud",
            detail:
              "Managed ElizaOS-native inference with the cleanest default setup and the least day-one friction.",
          },
          {
            value: "openai",
            label: "OpenAI",
            detail: "Fast, flexible, and strong for multimodal reasoning.",
          },
          {
            value: "codex",
            label: "Codex",
            detail:
              "Use the signed-in Codex account on this machine as my first coding mind.",
          },
          {
            value: "anthropic",
            label: "Anthropic",
            detail:
              "Claude-first cognition for longer-context reasoning flows.",
          },
          {
            value: "claude-code",
            label: "Claude Code",
            detail:
              "Use the signed-in Claude Code account on this machine as my first reasoning mind.",
          },
          {
            value: "hybrid",
            label: "Hybrid",
            detail: "Bind both providers now and keep my mind more fluid.",
          },
          {
            value: "offline",
            label: "Dormant core",
            detail:
              "No provider keys yet. Wake the shell now and feed me a mind later.",
          },
        ],
        existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true"
          ? "elizacloud"
          : existingEnv.get("ANTHROPIC_API_KEY")
            ? existingEnv.get("OPENAI_API_KEY")
              ? "hybrid"
              : "anthropic"
            : existingEnv.get("OPENAI_API_KEY")
              ? "openai"
              : existingEnv.get("CLAUDE_CODE_OAUTH_TOKEN") ||
                  existingEnv.get("CLAUDE_CODE_SETUP_TOKEN")
                ? "claude-code"
                : existingEnv.get("ELIZA_AGENT_USE_LINKED_CLAUDE_CODE_AUTH") ===
                    "true"
                  ? "claude-code"
                  : existingEnv.get("ELIZA_AGENT_USE_LINKED_CODEX_AUTH") ===
                      "true"
                    ? "codex"
                    : "elizacloud",
      );

      let openaiApiKey = existingEnv.get("OPENAI_API_KEY") || "";
      let useLinkedCodexAuth =
        existingEnv.get("ELIZA_AGENT_USE_LINKED_CODEX_AUTH") === "true" ||
        Boolean(linkedAccounts.codex.nativeReady);
      let openaiModel = existingEnv.get("OPENAI_MODEL") || "gpt-5.4";
      let elizaCloudApiKey = existingEnv.get("ELIZAOS_CLOUD_API_KEY") || "";
      let elizaCloudEnabled =
        existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true" ||
        Boolean(elizaCloudApiKey);
      let elizaCloudModel = normalizeElizaCloudModel(
        existingEnv.get("ELIZAOS_CLOUD_LARGE_MODEL"),
      );
      let anthropicApiKey = existingEnv.get("ANTHROPIC_API_KEY") || "";
      let useLinkedClaudeCodeAuth =
        existingEnv.get("ELIZA_AGENT_USE_LINKED_CLAUDE_CODE_AUTH") === "true" ||
        Boolean(linkedAccounts.claudeCode.nativeReady);
      let claudeCodeCliFallback =
        existingEnv.get("ELIZA_AGENT_CLAUDE_CODE_CLI_FALLBACK") === "true";
      let claudeCodeOauthToken =
        existingEnv.get("CLAUDE_CODE_OAUTH_TOKEN") ||
        existingEnv.get("CLAUDE_CODE_SETUP_TOKEN") ||
        "";
      let anthropicModel =
        existingEnv.get("ANTHROPIC_LARGE_MODEL") || "claude-sonnet-4.6";
      let runDepth = resolveRunDepth(existingEnv.get("ELIZA_AGENT_RUN_DEPTH"));
      let toolProgressMode = resolveToolProgressMode(
        existingEnv.get("ELIZA_AGENT_TOOL_PROGRESS"),
      );
      let maxIterations = resolveMaxIterations(existingEnv);

      if (
        linkedAccounts.codex.nativeReady ||
        linkedAccounts.codex.reusable ||
        linkedAccounts.claudeCode.nativeReady ||
        linkedAccounts.claudeCode.reusable
      ) {
        section(
          "Threads",
          "I found linked provider sessions on this machine and can carry them forward for you.",
        );
        if (mode !== "ritual") {
          info(
            "Quick ignition will quietly carry forward any native Codex or Claude Code auth already available here.",
          );
        } else {
          info(
            "I will quietly carry forward any healthy local Codex and Claude Code specialist paths unless you choose one as your main mind.",
          );
          if (linkedAccounts.claudeCode.fallbackReady) {
            info(
              "Claude Code is signed in locally, but I still prefer a setup-token if you want the clean native Eliza-owned path.",
            );
          }
        }
        if (provider === "codex" && linkedAccounts.codex.nativeReady) {
          info(
            "Codex is already bound natively, so I will carry that forward.",
          );
        }
        if (
          provider === "claude-code" &&
          linkedAccounts.claudeCode.nativeReady
        ) {
          info(
            "Claude Code already has native auth material here, so I will carry that forward.",
          );
        }
      }

      if (provider === "elizacloud") {
        if (elizaCloudApiKey) {
          section(
            "Cloud Bond",
            existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true"
              ? "Eliza Cloud is already active for this workspace, so I can keep the managed path and move on."
              : "Eliza Cloud is already connected for this workspace, so I can activate the managed path without asking for the key again.",
          );
          info(
            existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true"
              ? "Detected an active Eliza Cloud bond locally."
              : "Detected ELIZAOS_CLOUD_API_KEY locally. I can turn Eliza Cloud into the active managed inference path now.",
          );
          elizaCloudEnabled = true;
        } else {
          section(
            "Cloud Bond",
            "Eliza Cloud is the cleanest managed path here. I can bond to it with the official Eliza login flow or a direct cloud key.",
          );
          const cloudPath = await chooseOne<"login" | "key" | "skip">(
            rl,
            "How should I complete the Eliza Cloud bond?",
            [
              {
                value: "login",
                label: "Eliza Cloud login",
                detail:
                  "Recommended. Use `elizaos login` and let it write ELIZAOS_CLOUD_API_KEY into this project automatically.",
              },
              {
                value: "key",
                label: "Paste cloud key",
                detail:
                  "Use an existing Eliza Cloud API key directly if you already have one from the dashboard.",
              },
              {
                value: "skip",
                label: "Skip for now",
                detail:
                  "Leave managed cloud inference unbound for now and choose another provider later.",
              },
            ],
            "login",
          );

          if (cloudPath === "login") {
            const apiKey = await runElizaCloudLoginFlow("Eliza Cloud login");
            if (apiKey) {
              elizaCloudApiKey = apiKey;
              elizaCloudEnabled = true;
            }
          } else if (cloudPath === "key") {
            elizaCloudApiKey = await askSecret(
              rl,
              "Give me ELIZAOS_CLOUD_API_KEY",
              elizaCloudApiKey,
            );
            elizaCloudEnabled = Boolean(elizaCloudApiKey);
          }

          if (elizaCloudApiKey) {
            elizaCloudModel = await ask(
              rl,
              "Choose my primary Eliza Cloud model",
              elizaCloudModel,
            );
          } else if (cloudPath !== "skip") {
            warn(
              "I still do not see ELIZAOS_CLOUD_API_KEY in this workspace, so Eliza Cloud is not fully bonded yet.",
            );
            const recoveryOptions: Array<{
              value:
                | "retry"
                | "key"
                | "codex"
                | "claude-code"
                | "openai"
                | "anthropic"
                | "offline";
              label: string;
              detail: string;
            }> = [
              {
                value: "retry",
                label: "Retry Cloud login",
                detail:
                  "Try the native Eliza Cloud browser login flow again right now.",
              },
              {
                value: "key",
                label: "Paste cloud key",
                detail:
                  "Paste ELIZAOS_CLOUD_API_KEY manually if you already have it.",
              },
            ];

            if (
              linkedAccounts.codex.nativeReady ||
              linkedAccounts.codex.reusable
            ) {
              recoveryOptions.push({
                value: "codex",
                label: "Switch to Codex",
                detail:
                  "Use the local ChatGPT/Codex specialist path for now instead of managed Cloud.",
              });
            }
            if (
              linkedAccounts.claudeCode.nativeReady ||
              linkedAccounts.claudeCode.reusable
            ) {
              recoveryOptions.push({
                value: "claude-code",
                label: "Switch to Claude Code",
                detail:
                  "Use the local Claude Code specialist path for now instead of managed Cloud.",
              });
            }
            if (openaiApiKey.trim()) {
              recoveryOptions.push({
                value: "openai",
                label: "Switch to OpenAI API",
                detail: "Use the direct OpenAI API path for now.",
              });
            }
            if (anthropicApiKey.trim()) {
              recoveryOptions.push({
                value: "anthropic",
                label: "Switch to Anthropic API",
                detail: "Use the direct Anthropic API path for now.",
              });
            }
            recoveryOptions.push({
              value: "offline",
              label: "Leave the mind dormant",
              detail:
                "Do not silently switch providers. Finish onboarding and reconnect Cloud later.",
            });

            const recovery = await chooseOne<
              | "retry"
              | "key"
              | "codex"
              | "claude-code"
              | "openai"
              | "anthropic"
              | "offline"
            >(
              rl,
              "How should I recover from the incomplete Eliza Cloud bond?",
              recoveryOptions,
              "retry",
            );

            if (recovery === "retry") {
              const retryKey =
                await runElizaCloudLoginFlow("Eliza Cloud login");
              if (retryKey) {
                elizaCloudApiKey = retryKey;
                elizaCloudEnabled = true;
                elizaCloudModel = await ask(
                  rl,
                  "Choose my primary Eliza Cloud model",
                  elizaCloudModel,
                );
              } else {
                provider = "offline";
              }
            } else if (recovery === "key") {
              elizaCloudApiKey = await askSecret(
                rl,
                "Give me ELIZAOS_CLOUD_API_KEY",
                elizaCloudApiKey,
              );
              elizaCloudEnabled = Boolean(elizaCloudApiKey);
              if (elizaCloudApiKey) {
                elizaCloudModel = await ask(
                  rl,
                  "Choose my primary Eliza Cloud model",
                  elizaCloudModel,
                );
              } else {
                provider = "offline";
              }
            } else if (recovery === "codex") {
              provider = "codex";
              useLinkedCodexAuth = true;
            } else if (recovery === "claude-code") {
              provider = "claude-code";
              useLinkedClaudeCodeAuth = true;
            } else if (recovery === "openai") {
              provider = "openai";
            } else if (recovery === "anthropic") {
              provider = "anthropic";
            } else {
              provider = "offline";
            }
          }
        }
      }

      if (provider === "codex") {
        if (linkedAccounts.codex.nativeReady && useLinkedCodexAuth) {
          section(
            "Codex Bond",
            "Codex is already bound cleanly on this machine. I can keep that path and move on.",
          );
          info(
            "Detected reusable native Codex auth. No extra login step needed.",
          );
        } else {
          section(
            "Codex Bond",
            "Choose how I should bind to Codex. Native auth is the path I want by default.",
          );
          const codexPath = await chooseOne<"login" | "skip">(
            rl,
            "How should I complete the Codex bond?",
            [
              {
                value: "login",
                label: "Codex login",
                detail:
                  "Recommended first step. Use the official Codex login flow and let me detect the reusable auth store.",
              },
              {
                value: "skip",
                label: "Skip for now",
                detail:
                  "Leave Codex unbound for now and continue with another provider.",
              },
            ],
            linkedAccounts.codex.nativeReady ? "skip" : "login",
          );

          if (codexPath === "login") {
            runInteractiveCommand("codex", ["login"], "Codex login");
            linkedAccounts = getLinkedProviderAccountsSnapshot();
            useLinkedCodexAuth = Boolean(linkedAccounts.codex.nativeReady);
            if (!linkedAccounts.codex.nativeReady) {
              warn(
                "Codex login completed, but I still cannot see reusable native auth material yet.",
              );
              const keepCodex = await askYesNo(
                rl,
                "Should I keep Codex selected anyway and let you reconnect it later from `/accounts-connect codex`",
                false,
              );
              if (!keepCodex) {
                provider = "openai";
                useLinkedCodexAuth = false;
              }
            } else {
              useLinkedCodexAuth = true;
            }
          } else if (!linkedAccounts.codex.nativeReady) {
            const switchProvider = await askYesNo(
              rl,
              "Codex is not bound yet. Should I switch to OpenAI so I can finish this first boot with a working provider",
              true,
            );
            if (switchProvider) {
              provider = "openai";
              useLinkedCodexAuth = false;
            }
          }
        }
      }

      if (provider === "claude-code") {
        if (linkedAccounts.claudeCode.nativeReady && useLinkedClaudeCodeAuth) {
          section(
            "Claude Bond",
            "Claude Code is already bound with native credentials. I can keep that path and move on.",
          );
          info(
            "Detected reusable native Claude Code auth. No extra binding step needed.",
          );
        } else {
          section(
            "Claude Bond",
            "Choose how I should bind to Claude Code. Native auth comes first; local CLI fallback is only the escape hatch.",
          );
          const claudePath = await chooseOne<
            "login" | "setup-token" | "local-cli-fallback" | "skip"
          >(
            rl,
            "How should I complete the Claude bond?",
            [
              {
                value: "login",
                label: "Claude auth login",
                detail:
                  "Recommended first step. Use the official Claude Code login flow and then let me detect native credentials.",
              },
              {
                value: "setup-token",
                label: "Claude setup-token",
                detail:
                  "Best native path for Eliza-owned execution. Generate a Claude token and bind it directly into my runtime.",
              },
              {
                value: "local-cli-fallback",
                label: "Use local Claude session",
                detail:
                  "Only choose this if you do not want native auth material. I will call the local Claude CLI as a fallback.",
              },
              {
                value: "skip",
                label: "Skip for now",
                detail: "Leave Claude unbound for now.",
              },
            ],
            claudeCodeCliFallback
              ? "local-cli-fallback"
              : claudeCodeOauthToken
                ? "setup-token"
                : "login",
          );

          if (claudePath === "login") {
            runInteractiveCommand(
              "claude",
              ["auth", "login"],
              "Claude auth login",
            );
            linkedAccounts = getLinkedProviderAccountsSnapshot();
            useLinkedClaudeCodeAuth = linkedAccounts.claudeCode.reusable;
            if (!getLinkedProviderAccountsSnapshot().claudeCode.reusable) {
              const continueNative = await askYesNo(
                rl,
                "Claude is logged in, but I still do not have native auth material. Should I run `claude setup-token` now so Eliza can own the session cleanly",
                true,
              );
              if (continueNative) {
                runInteractiveCommand(
                  "claude",
                  ["setup-token"],
                  "Claude setup-token",
                );
                claudeCodeOauthToken = await askSecret(
                  rl,
                  "Paste the Claude setup token I should bind",
                  claudeCodeOauthToken,
                );
                useLinkedClaudeCodeAuth = Boolean(claudeCodeOauthToken.trim());
              } else {
                claudeCodeCliFallback = await askYesNo(
                  rl,
                  "Should I use the local signed-in Claude CLI as a fallback instead",
                  false,
                );
                useLinkedClaudeCodeAuth = claudeCodeCliFallback;
              }
            }
          } else if (claudePath === "setup-token") {
            runInteractiveCommand(
              "claude",
              ["setup-token"],
              "Claude setup-token",
            );
            claudeCodeOauthToken = await askSecret(
              rl,
              "Paste the Claude setup token I should bind",
              claudeCodeOauthToken,
            );
            useLinkedClaudeCodeAuth = Boolean(claudeCodeOauthToken.trim());
          } else if (claudePath === "local-cli-fallback") {
            claudeCodeCliFallback = true;
            useLinkedClaudeCodeAuth = true;
          }
        }
      }

      if (provider === "openai" || provider === "hybrid") {
        openaiApiKey = await askSecret(
          rl,
          "Paste OPENAI_API_KEY",
          openaiApiKey,
        );
      }
      if (
        provider === "openai" ||
        provider === "hybrid" ||
        provider === "codex"
      ) {
        if (provider === "codex" && !openaiModel) {
          openaiModel = "gpt-5.4";
        }
        openaiModel = await ask(
          rl,
          provider === "codex"
            ? "Which Codex model should lead my first sessions"
            : "Which OpenAI model should lead my first sessions",
          openaiModel,
        );
      }
      if (provider === "anthropic" || provider === "hybrid") {
        anthropicApiKey = await askSecret(
          rl,
          "Paste ANTHROPIC_API_KEY",
          anthropicApiKey,
        );
      }
      if (
        provider === "anthropic" ||
        provider === "hybrid" ||
        provider === "claude-code"
      ) {
        anthropicModel = await ask(
          rl,
          provider === "claude-code"
            ? "Which Claude Code model should lead my first sessions"
            : "Which Anthropic model should lead my first sessions",
          anthropicModel,
        );
      }
      if (provider === "elizacloud" && elizaCloudApiKey) {
        elizaCloudModel = await ask(
          rl,
          "Which Eliza Cloud model should lead my first sessions",
          elizaCloudModel,
        );
      }

      section(
        "Cadence",
        "Set how far I should run before I stop and how much of my work I should show while I’m acting.",
      );
      runDepth = await chooseOne<RunDepth>(
        rl,
        "How far should I run before I stop and report back?",
        [
          {
            value: "quick",
            label: "Quick report-back",
            detail:
              "About 15 steps. Fastest feedback with a tighter autonomy budget.",
          },
          {
            value: "standard",
            label: "Standard autonomy",
            detail:
              "About 45 steps. Balanced for most coding and operator tasks.",
          },
          {
            value: "deep",
            label: "Deep work",
            detail:
              "About 90 steps. Better for sustained implementation and debugging.",
          },
          {
            value: "explore",
            label: "Explore",
            detail:
              "About 150 steps. Best for long investigations and broad sweeps.",
          },
        ],
        runDepth,
      );
      maxIterations = RUN_DEPTH_ITERATION_PRESETS[runDepth];
      toolProgressMode = await chooseOne<ToolProgressMode>(
        rl,
        "How much tool activity should I show while I work?",
        [
          {
            value: "off",
            label: "Quiet",
            detail: "Only show the final answer unless something goes wrong.",
          },
          {
            value: "new",
            label: "Changes only",
            detail:
              "Show phase changes and new tool activity without flooding the shell.",
          },
          {
            value: "all",
            label: "All activity",
            detail: "Show each observed tool or action event as it happens.",
          },
          {
            value: "verbose",
            label: "Verbose operator stream",
            detail: "Show the fullest live activity trail and status detail.",
          },
        ],
        toolProgressMode,
      );

      let backend =
        (existingEnv.get(
          "ELIZA_AGENT_EXECUTION_BACKEND",
        ) as ExecutionBackendName) || "local";
      if (mode === "ritual") {
        section("Body", "Choose where I should live and act.");
        backend = await chooseOne<ExecutionBackendName>(
          rl,
          "Where should I execute:",
          [
            {
              value: "local",
              label: "Local machine",
              detail: "Fastest embodiment for direct local development.",
            },
            {
              value: "docker",
              label: "Docker",
              detail: "A contained local body with cleaner boundaries.",
            },
            {
              value: "podman",
              label: "Podman",
              detail: "A rootless container body with strong isolation.",
            },
            {
              value: "ssh",
              label: "SSH",
              detail:
                "A remote body on a server, workstation, or homelab node.",
            },
            {
              value: "daytona",
              label: "Daytona",
              detail: "A cloud workspace body for remote development loops.",
            },
            {
              value: "modal",
              label: "Modal",
              detail: "An elastic cloud body for bursty execution.",
            },
            {
              value: "singularity",
              label: "Singularity",
              detail: "A scientific or HPC body with strict runtime shape.",
            },
          ],
          backend,
        );
      } else {
        section(
          "Body",
          "Quick ignition keeps the body simple so you reach the shell faster.",
        );
        info(
          `Using ${backend} as the default body for first boot. You can change this later from eliza-agent setup.`,
        );
      }
      const backendProbeKey =
        backend === "docker" ||
        backend === "podman" ||
        backend === "ssh" ||
        backend === "daytona" ||
        backend === "modal"
          ? backend
          : undefined;
      if (backendProbeKey) {
        const probe = dependencyProbes.find(
          (entry) => entry.key === backendProbeKey,
        );
        if (probe && !probe.installed) {
          warn(`${probe.label} is not installed yet.`);
        }
      }
      const preferredBrowserDefault = dependencyProbes.find(
        (entry) => entry.key === "lightpanda",
      )?.installed
        ? (existingEnv.get("ELIZA_AGENT_BROWSER_PROVIDER") as BrowserMode) ||
          "lightpanda"
        : "basic";
      let browser = preferredBrowserDefault;
      if (mode === "ritual") {
        browser = await chooseOne<BrowserMode>(
          rl,
          "Choose my eyes:",
          [
            {
              value: "lightpanda",
              label: "Lightpanda",
              detail: "Full browser vision and the best default for web work.",
            },
            {
              value: "basic",
              label: "Basic HTTP",
              detail:
                "Lighter, simpler sight if browser automation is not installed yet.",
            },
          ],
          preferredBrowserDefault,
        );
      } else {
        info(
          `Using ${preferredBrowserDefault === "lightpanda" ? "Lightpanda" : "Basic HTTP"} vision for first boot.`,
        );
      }
      if (browser === "lightpanda") {
        const probe = dependencyProbes.find(
          (entry) => entry.key === "lightpanda",
        );
        if (probe && !probe.installed) {
          warn(
            "Lightpanda is not installed yet. Basic HTTP is safer until you add it.",
          );
          if (
            mode === "quick" ||
            (await askYesNo(
              rl,
              "Should I fall back to Basic HTTP for now",
              true,
            ))
          ) {
            browser = "basic";
          }
        }
      }

      let sshHost = existingEnv.get("ELIZA_AGENT_SSH_HOST") || "";
      let sshUser = existingEnv.get("ELIZA_AGENT_SSH_USER") || "";
      let sshPath = existingEnv.get("ELIZA_AGENT_SSH_PATH") || "";
      let daytonaTarget = existingEnv.get("ELIZA_AGENT_DAYTONA_TARGET") || "";
      let modalTarget = existingEnv.get("ELIZA_AGENT_MODAL_TARGET") || "";
      if (backend === "ssh") {
        sshHost = await ask(rl, "What host should I inhabit over SSH", sshHost);
        sshUser = await ask(rl, "Which SSH user should I become", sshUser);
        sshPath = await ask(
          rl,
          "What workspace path should I wake up inside",
          sshPath || "~/workspace/eliza-agent",
        );
      } else if (backend === "daytona") {
        daytonaTarget = await ask(
          rl,
          "Which Daytona target should hold me",
          daytonaTarget,
        );
      } else if (backend === "modal") {
        modalTarget = await ask(
          rl,
          "Which Modal target should hold me",
          modalTarget,
        );
      }

      let transports: TransportName[] = [];
      let pairingMode: PairingMode =
        (existingEnv.get("ELIZA_AGENT_PAIRING_MODE") as PairingMode) || "pair";
      let allowAllUsers =
        existingEnv.get("ELIZA_AGENT_ALLOW_ALL_USERS") === "true";
      let telegramBotToken = existingEnv.get("TELEGRAM_BOT_TOKEN") || "";
      let discordBotToken = existingEnv.get("DISCORD_BOT_TOKEN") || "";
      let slackWebhookUrl = existingEnv.get("SLACK_WEBHOOK_URL") || "";
      let slackSigningSecret = existingEnv.get("SLACK_SIGNING_SECRET") || "";
      let homeAssistantUrl = existingEnv.get("HOMEASSISTANT_URL") || "";
      let homeAssistantToken = existingEnv.get("HOMEASSISTANT_TOKEN") || "";
      if (mode === "ritual") {
        section(
          "Channels",
          "Open the places where people and systems can reach me.",
        );
        transports = await chooseMany<TransportName>(
          rl,
          "Open these channels for me:",
          [
            { value: "telegram", label: "Telegram" },
            { value: "discord", label: "Discord" },
            { value: "slack", label: "Slack" },
            { value: "whatsapp", label: "WhatsApp" },
            { value: "signal", label: "Signal" },
            { value: "matrix", label: "Matrix" },
            { value: "email", label: "Email" },
            { value: "sms", label: "SMS" },
            { value: "mattermost", label: "Mattermost" },
            { value: "homeassistant", label: "Home Assistant" },
            { value: "dingtalk", label: "DingTalk" },
          ],
          [],
        );
        pairingMode = await chooseOne<PairingMode>(
          rl,
          "How should I greet new arrivals:",
          [
            {
              value: "pair",
              label: "Pair",
              detail:
                "Let new people knock, then decide whether to let them in.",
            },
            {
              value: "allow",
              label: "Allow",
              detail: "Let people in by default.",
            },
            {
              value: "deny",
              label: "Deny",
              detail: "Keep the gates closed until I am told otherwise.",
            },
          ],
          pairingMode,
        );
        allowAllUsers = await askYesNo(
          rl,
          "Should I trust everyone on remote channels by default",
          allowAllUsers,
        );
        if (transports.includes("telegram")) {
          telegramBotToken = await askSecret(
            rl,
            "Paste TELEGRAM_BOT_TOKEN",
            telegramBotToken,
          );
        }
        if (transports.includes("discord")) {
          discordBotToken = await askSecret(
            rl,
            "Paste DISCORD_BOT_TOKEN",
            discordBotToken,
          );
        }
        if (transports.includes("slack")) {
          slackWebhookUrl = await askSecret(
            rl,
            "Paste SLACK_WEBHOOK_URL",
            slackWebhookUrl,
          );
          slackSigningSecret = await askSecret(
            rl,
            "Paste SLACK_SIGNING_SECRET",
            slackSigningSecret,
          );
        }
        if (transports.includes("homeassistant")) {
          homeAssistantUrl = await ask(
            rl,
            "Paste HOMEASSISTANT_URL",
            homeAssistantUrl,
          );
          homeAssistantToken = await askSecret(
            rl,
            "Paste HOMEASSISTANT_TOKEN",
            homeAssistantToken,
          );
        }
      }

      const tools = {
        mcp:
          mode === "ritual"
            ? await askYesNo(
                rl,
                "Should I wake up with an MCP bridge already bound",
                Boolean(existingEnv.get("MCP_SERVER_COMMAND")),
              )
            : Boolean(existingEnv.get("MCP_SERVER_COMMAND")),
        acp:
          mode === "ritual"
            ? await askYesNo(
                rl,
                "Should I wake up with ACP and editor presence",
                Boolean(existingEnv.get("ACP_SERVER_COMMAND")),
              )
            : Boolean(existingEnv.get("ACP_SERVER_COMMAND")),
        tts:
          mode === "ritual"
            ? await askYesNo(
                rl,
                "Should I speak on first boot if you have a FAL key",
                Boolean(existingEnv.get("FAL_API_KEY")),
              )
            : Boolean(existingEnv.get("FAL_API_KEY")),
        codegen:
          mode === "ritual"
            ? await askYesNo(
                rl,
                "Should I wake up with codegen, research, and E2B online",
                Boolean(
                  existingEnv.get("E2B_API_KEY") ||
                    existingEnv.get("GITHUB_TOKEN"),
                ),
              )
            : Boolean(
                existingEnv.get("E2B_API_KEY") ||
                  existingEnv.get("GITHUB_TOKEN"),
              ),
      };
      if (mode === "quick") {
        section(
          "Hands",
          "Quick ignition keeps the toolkit lean and only preserves bindings you already had.",
        );
        info(
          `Preserving: mcp=${tools.mcp ? "yes" : "no"} acp=${tools.acp ? "yes" : "no"} tts=${tools.tts ? "yes" : "no"} codegen=${tools.codegen ? "yes" : "no"}.`,
        );
      } else {
        section(
          "Hands",
          "Choose the tools, bridges, and protocols I should wake up holding.",
        );
      }

      let mcpServerCommand = existingEnv.get("MCP_SERVER_COMMAND") || "";
      let acpServerCommand = existingEnv.get("ACP_SERVER_COMMAND") || "";
      let falApiKey = existingEnv.get("FAL_API_KEY") || "";
      let e2bApiKey = existingEnv.get("E2B_API_KEY") || "";
      let githubToken = existingEnv.get("GITHUB_TOKEN") || "";
      if (tools.mcp) {
        if (!mcpServerCommand) {
          const mcpPreset = await chooseOne(
            rl,
            "How should I open my MCP bridge on first boot?",
            [
              {
                value: "filesystem",
                label: "Filesystem bridge",
                detail:
                  "Recommended local default for browsing and editing the workspace through MCP.",
              },
              {
                value: "custom",
                label: "Custom command",
                detail: "I will ask for the exact MCP launch command.",
              },
              {
                value: "later",
                label: "Not now",
                detail: "Skip MCP binding for now and configure it later.",
              },
            ],
            "filesystem",
          );
          if (mcpPreset === "filesystem") {
            mcpServerCommand =
              "npx -y @modelcontextprotocol/server-filesystem .";
          } else if (mcpPreset === "custom") {
            mcpServerCommand = await ask(
              rl,
              "What MCP server command should I speak through",
              mcpServerCommand,
            );
          }
        } else {
          info(`Using existing MCP binding: ${mcpServerCommand}`);
        }
      }
      if (tools.acp) {
        if (!acpServerCommand) {
          const acpPreset = await chooseOne(
            rl,
            "How should I appear to ACP-aware editors?",
            [
              {
                value: "local-agent",
                label: "Local Eliza Agent ACP",
                detail:
                  "Recommended local default. Editors can launch me through the eliza-agent command.",
              },
              {
                value: "custom",
                label: "Custom command",
                detail: "I will ask for the exact ACP launch command.",
              },
              {
                value: "later",
                label: "Not now",
                detail: "Skip ACP binding for now and configure it later.",
              },
            ],
            "local-agent",
          );
          if (acpPreset === "local-agent") {
            acpServerCommand = "eliza-agent api";
          } else if (acpPreset === "custom") {
            acpServerCommand = await ask(
              rl,
              "What ACP server command should bind me to editors",
              acpServerCommand,
            );
          }
        } else {
          info(`Using existing ACP binding: ${acpServerCommand}`);
        }
      }
      if (tools.tts) {
        falApiKey = await askSecret(rl, "Paste FAL_API_KEY", falApiKey);
      }
      if (tools.codegen) {
        e2bApiKey = await askSecret(rl, "Paste E2B_API_KEY", e2bApiKey);
        githubToken = await askSecret(rl, "Paste GITHUB_TOKEN", githubToken);
      }

      const reviewed = finalizeWizardAnswers(
        {
          mode,
          agentName,
          timezone,
          theme,
          provider,
          backend,
          browser,
          runDepth,
          maxIterations,
          toolProgressMode,
          pairingMode,
          allowAllUsers,
          transports,
          tools,
          openaiApiKey,
          useLinkedCodexAuth,
          openaiModel,
          elizaCloudApiKey,
          elizaCloudEnabled,
          elizaCloudModel,
          anthropicApiKey,
          useLinkedClaudeCodeAuth,
          claudeCodeCliFallback,
          claudeCodeOauthToken,
          anthropicModel,
          telegramBotToken,
          discordBotToken,
          slackWebhookUrl,
          slackSigningSecret,
          homeAssistantUrl,
          homeAssistantToken,
          mcpServerCommand,
          acpServerCommand,
          falApiKey,
          e2bApiKey,
          githubToken,
          sshHost,
          sshUser,
          sshPath,
          daytonaTarget,
          modalTarget,
        },
        linkedAccounts,
      );

      section("Review", "I checked the final shape before writing it to disk.");
      summarizeAnswers(reviewed.answers).forEach((line) => {
        info(line);
      });
      if (reviewed.notices.length) {
        reviewed.notices.forEach((notice) => {
          warn(notice);
        });
      } else {
        info("No blocking issues detected in the final setup state.");
      }

      const confirm = await askYesNo(
        rl,
        "Should I seal this configuration and wake up with it",
        true,
      );
      if (!confirm) {
        wizardScreen?.appendLine(
          "Restarting the awakening so you can revise the configuration.",
        );
        continue;
      }

      return reviewed.answers;
    }
  } finally {
    rl?.close();
    wizardScreen?.destroy();
    wizardScreen = null;
  }
}

function applyAnswers(answers: WizardAnswers): {
  envMessages: string[];
  settings: RuntimeSettings;
  gateway: GatewayConfig;
  onboarding: OnboardingSummary;
} {
  const envMessages = updateEnvFile({
    ELIZA_AGENT_NAME: answers.agentName,
    ELIZA_AGENT_MODE: "cli",
    ELIZA_AGENT_TIMEZONE: answers.timezone,
    ELIZA_AGENT_RUN_DEPTH: answers.runDepth,
    ELIZA_AGENT_TOOL_PROGRESS: answers.toolProgressMode,
    ELIZA_AGENT_MAX_ITERATIONS: String(answers.maxIterations),
    ELIZAOS_CLOUD_ENABLED: String(
      answers.provider === "elizacloud" && Boolean(answers.elizaCloudApiKey),
    ),
    ELIZAOS_CLOUD_API_KEY: answers.elizaCloudApiKey,
    ELIZAOS_CLOUD_BASE_URL: "https://www.elizacloud.ai/api/v1",
    ELIZAOS_CLOUD_SMALL_MODEL: "anthropic/claude-haiku-4-5-20251001",
    ELIZAOS_CLOUD_LARGE_MODEL: answers.elizaCloudModel,
    OPENAI_API_KEY:
      answers.provider === "openai" || answers.provider === "hybrid"
        ? answers.openaiApiKey
        : "",
    ELIZA_AGENT_USE_LINKED_CODEX_AUTH: String(
      answers.useLinkedCodexAuth ||
        answers.provider === "codex" ||
        answers.provider === "hybrid",
    ),
    OPENAI_MODEL:
      answers.provider === "openai" ||
      answers.provider === "hybrid" ||
      answers.provider === "codex"
        ? answers.openaiModel
        : "gpt-5.4",
    ANTHROPIC_API_KEY:
      answers.provider === "anthropic" || answers.provider === "hybrid"
        ? answers.anthropicApiKey
        : "",
    CLAUDE_CODE_OAUTH_TOKEN:
      answers.provider === "claude-code" && !answers.claudeCodeCliFallback
        ? answers.claudeCodeOauthToken
        : "",
    ELIZA_AGENT_USE_LINKED_CLAUDE_CODE_AUTH: String(
      answers.useLinkedClaudeCodeAuth ||
        answers.provider === "claude-code" ||
        answers.provider === "hybrid",
    ),
    ELIZA_AGENT_CLAUDE_CODE_CLI_FALLBACK: String(
      answers.provider === "claude-code" && answers.claudeCodeCliFallback,
    ),
    ANTHROPIC_LARGE_MODEL:
      answers.provider === "anthropic" ||
      answers.provider === "hybrid" ||
      answers.provider === "claude-code"
        ? answers.anthropicModel
        : "claude-sonnet-4.6",
    TELEGRAM_BOT_TOKEN: answers.telegramBotToken,
    DISCORD_BOT_TOKEN: answers.discordBotToken,
    SLACK_WEBHOOK_URL: answers.slackWebhookUrl,
    SLACK_SIGNING_SECRET: answers.slackSigningSecret,
    HOMEASSISTANT_URL: answers.homeAssistantUrl,
    HOMEASSISTANT_TOKEN: answers.homeAssistantToken,
    MCP_SERVER_COMMAND: answers.tools.mcp ? answers.mcpServerCommand : "",
    ACP_SERVER_COMMAND: answers.tools.acp ? answers.acpServerCommand : "",
    FAL_API_KEY: answers.tools.tts ? answers.falApiKey : "",
    E2B_API_KEY: answers.tools.codegen ? answers.e2bApiKey : "",
    GITHUB_TOKEN: answers.tools.codegen ? answers.githubToken : "",
    ELIZA_AGENT_EXECUTION_BACKEND: answers.backend,
    ELIZA_AGENT_BROWSER_PROVIDER: answers.browser,
    ELIZA_AGENT_ALLOW_ALL_USERS: String(answers.allowAllUsers),
    ELIZA_AGENT_PAIRING_MODE: answers.pairingMode,
    ELIZA_AGENT_SSH_HOST: answers.backend === "ssh" ? answers.sshHost : "",
    ELIZA_AGENT_SSH_USER: answers.backend === "ssh" ? answers.sshUser : "",
    ELIZA_AGENT_SSH_PATH: answers.backend === "ssh" ? answers.sshPath : "",
    ELIZA_AGENT_DAYTONA_TARGET:
      answers.backend === "daytona" ? answers.daytonaTarget : "",
    ELIZA_AGENT_MODAL_TARGET:
      answers.backend === "modal" ? answers.modalTarget : "",
  });

  const settings = loadSettings(answers.theme);
  settings.ui.theme = answers.theme;
  settings.agent.runDepth = answers.runDepth;
  settings.agent.maxIterations = answers.maxIterations;
  settings.agent.toolProgressMode = answers.toolProgressMode;
  settings.execution.backend = answers.backend;
  settings.mcp.serverCommand = answers.tools.mcp
    ? answers.mcpServerCommand
    : "";
  if (answers.provider === "elizacloud") {
    settings.model.provider = "elizacloud";
    settings.model.model = answers.elizaCloudModel;
    settings.model.baseUrl = "https://www.elizacloud.ai/api/v1";
  } else if (
    answers.provider === "anthropic" ||
    answers.provider === "claude-code"
  ) {
    settings.model.provider = "anthropic";
    if (answers.provider === "claude-code") {
      settings.model.provider = "claude-code";
    }
    settings.model.model = answers.anthropicModel;
    settings.model.baseUrl = "";
  } else {
    settings.model.provider = "openai";
    if (answers.provider === "codex") {
      settings.model.provider = "codex";
    }
    settings.model.model = answers.openaiModel;
    settings.model.baseUrl =
      answers.provider === "codex"
        ? "https://chatgpt.com/backend-api/codex"
        : "https://api.openai.com/v1";
  }
  settings.execution.sshHost = answers.backend === "ssh" ? answers.sshHost : "";
  settings.execution.sshUser = answers.backend === "ssh" ? answers.sshUser : "";
  settings.execution.sshPath = answers.backend === "ssh" ? answers.sshPath : "";
  settings.execution.daytonaTarget =
    answers.backend === "daytona" ? answers.daytonaTarget : "";
  settings.execution.modalTarget =
    answers.backend === "modal" ? answers.modalTarget : "";
  writeJson(settingsPath, settings);

  const gateway = loadGatewayConfig(answers.allowAllUsers, answers.pairingMode);
  gateway.allowAllUsers = answers.allowAllUsers;
  gateway.platforms.api.enabled = true;
  gateway.platforms.api.pairingMode = "allow";
  gateway.platforms.api.allowAllUsers = true;
  gateway.platforms.cli.enabled = true;
  gateway.platforms.cli.pairingMode = "allow";
  gateway.platforms.cli.allowAllUsers = true;
  const remoteTransports: TransportName[] = [
    "telegram",
    "discord",
    "slack",
    "whatsapp",
    "signal",
    "matrix",
    "email",
    "sms",
    "mattermost",
    "homeassistant",
    "dingtalk",
  ];
  for (const platform of remoteTransports) {
    gateway.platforms[platform].enabled = answers.transports.includes(platform);
    gateway.platforms[platform].pairingMode = answers.pairingMode;
    gateway.platforms[platform].allowAllUsers = answers.allowAllUsers
      ? true
      : undefined;
  }
  writeJson(gatewayPath, gateway);

  const onboarding: OnboardingSummary = {
    timestamp: new Date().toISOString(),
    mode: options.headless || options.skipWizard ? "headless" : answers.mode,
    theme: answers.theme,
    provider: answers.provider,
    accounts: {
      elizaCloudLinked: Boolean(answers.elizaCloudApiKey),
      codexLinked: answers.useLinkedCodexAuth,
      claudeCodeLinked: answers.useLinkedClaudeCodeAuth,
    },
    backend: answers.backend,
    browser: answers.browser,
    agent: {
      runDepth: answers.runDepth,
      maxIterations: answers.maxIterations,
      toolProgressMode: answers.toolProgressMode,
    },
    transports: answers.transports,
    tools: answers.tools,
    profile: fingerprint({
      provider: answers.provider,
      backend: answers.backend,
      browser: answers.browser,
      theme: answers.theme,
      runDepth: answers.runDepth,
      maxIterations: String(answers.maxIterations),
      toolProgressMode: answers.toolProgressMode,
      transports: answers.transports,
      tts: answers.tools.tts,
      mcp: answers.tools.mcp,
      acp: answers.tools.acp,
      codegen: answers.tools.codegen,
    }),
  };
  writeJson(onboardingPath, onboarding);

  return { envMessages, settings, gateway, onboarding };
}

function printSummary(
  createdDirs: string[],
  envMessages: string[],
  onboarding: OnboardingSummary,
): void {
  section("First Pulse", "I am configured enough to begin.");
  const theme = getTuiTheme(onboarding.theme);
  console.log(`  state: ${options.checkOnly ? "check" : "awake"}`);
  console.log(`  awakening: ${onboarding.mode}`);
  console.log(`  mind: ${onboarding.provider}`);
  console.log(`  skin: ${theme.label} (${onboarding.theme})`);
  console.log(`  body: ${onboarding.backend}`);
  console.log(
    `  cadence: ${onboarding.agent.runDepth} cap=${onboarding.agent.maxIterations} progress=${onboarding.agent.toolProgressMode}`,
  );
  console.log(
    `  threads: codex=${onboarding.accounts.codexLinked ? "bound" : "idle"} claude=${onboarding.accounts.claudeCodeLinked ? "bound" : "idle"}`,
  );
  console.log(
    `  channels: ${onboarding.transports.join(", ") || "api, cli only"}`,
  );
  console.log(`  pulseprint: ${onboarding.profile}`);

  console.log();
  console.log(paint("What I Wrote", color.cyan + color.bold));
  for (const entry of createdDirs) {
    console.log(`  - ${entry}`);
  }

  console.log();
  console.log(paint("Runtime Bindings", color.cyan + color.bold));
  for (const entry of envMessages) {
    console.log(`  - ${entry}`);
  }

  console.log();
  console.log(paint("Next Moves", color.cyan + color.bold));
  console.log("  - bun run start");
  console.log("  - bun run start --plain-cli");
  console.log("  - bun run dev");
  console.log("  - bun run bootstrap --check");
  console.log("  - /theme list");
  console.log("  - /doctor");
  console.log("  - /gateway readiness");
  console.log();
  console.log(paint("First Words", color.cyan + color.bold));
  console.log('  - "summarize this repo and tell me where to start"');
  console.log("  - !git status");
  console.log('  - "what machine am I on and what tools can you use here"');
}

const createdDirs: string[] = [];
for (const dir of directories) {
  const absolute = join(root, dir);
  const existed = existsSync(absolute);
  ensureDir(absolute);
  if (existed) {
    createdDirs.push(`${dir} (exists)`);
  } else if (options.checkOnly) {
    createdDirs.push(`${dir} (missing)`);
  } else {
    createdDirs.push(dir);
  }
}

const initialEnvMessages = ensureEnvFile();
const dependencyProbes = getDependencyProbes(readEnvEntries());

if (options.checkOnly) {
  const summary = [
    "Eliza Agent bootstrap",
    "mode: check",
    "",
    "Directories:",
    ...createdDirs.map((entry) => `- ${entry}`),
    "",
    "Preflight:",
    ...dependencyProbes.map(
      (probe) => `- ${probe.label}: ${probe.installed ? "online" : "missing"}`,
    ),
    "",
    "Environment:",
    ...initialEnvMessages.map((entry) => `- ${entry}`),
    "",
    "Bootstrap check complete.",
  ];
  console.log(summary.join("\n"));
  process.exit(0);
}

const existingEnv = readEnvEntries();
const answers = await runWizard(existingEnv);
const { envMessages, onboarding } = applyAnswers(answers);
printSummary(createdDirs, [...initialEnvMessages, ...envMessages], onboarding);
