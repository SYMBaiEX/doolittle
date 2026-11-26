import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveNubExecutable,
  spawnTerminalSession,
  type TerminalSession,
} from "./terminal-pty";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const bootstrapEntry = resolve(repoRoot, "scripts/bootstrap.ts");

export interface WizardFixture {
  /** Fake repository root the wizard treats as its project. */
  root: string;
  /** Private HOME so no real user config is ever touched. */
  home: string;
  /** Private data directory receiving settings/onboarding writes. */
  data: string;
  /** Isolated offline environment for the wizard child process. */
  environment: NodeJS.ProcessEnv;
  /** Remove the fixture tree; safe to call more than once. */
  cleanup: () => void;
}

/**
 * Create the isolated offline fixture every wizard PTY test starts from: a
 * private HOME, a minimal offline .env, and no host credentials. The offline
 * Dormant core path needs no provider keys or network. No test may ever run
 * the wizard against the real home directory.
 */
export function createWizardFixture(
  options: { extraEnvLines?: string[]; environment?: NodeJS.ProcessEnv } = {},
): WizardFixture {
  const root = mkdtempSync(join(tmpdir(), "doolittle-wizard-pty-"));
  const home = join(root, "home");
  const data = join(root, "data");
  mkdirSync(home, { recursive: true });
  mkdirSync(data, { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "doolittle", version: "0.1.0" })}\n`,
  );
  const envLines = [
    "DOOLITTLE_NAME=AuditBot",
    "DOOLITTLE_MODE=cli",
    `DOOLITTLE_DATA_DIR=${data}`,
    `DOOLITTLE_WORKSPACE_DIR=${root}`,
    "DOOLITTLE_TIMEZONE=America/Chicago",
    "DOOLITTLE_USE_LINKED_CODEX_AUTH=false",
    "DOOLITTLE_USE_LINKED_CLAUDE_CODE_AUTH=false",
    "DOOLITTLE_CLAUDE_CODE_CLI_FALLBACK=false",
    "DOOLITTLE_OFFLINE_BOOTSTRAP=true",
    "DOOLITTLE_EXECUTION_BACKEND=local",
    "DOOLITTLE_BROWSER_PROVIDER=basic",
    "DOOLITTLE_RUN_DEPTH=standard",
    "DOOLITTLE_TOOL_PROGRESS=new",
    "DOOLITTLE_ALLOW_ALL_USERS=false",
    "DOOLITTLE_PAIRING_MODE=pair",
    "OPENAI_API_KEY=",
    "ANTHROPIC_API_KEY=",
    "ELIZAOS_CLOUD_API_KEY=",
    "CLAUDE_CODE_OAUTH_TOKEN=",
    "CLAUDE_CODE_SETUP_TOKEN=",
    "FAL_API_KEY=",
    "E2B_API_KEY=",
    "GITHUB_TOKEN=",
    ...(options.extraEnvLines ?? []),
    "",
  ];
  writeFileSync(join(root, ".env"), envLines.join("\n"), { mode: 0o600 });
  writeFileSync(join(root, ".env.example"), envLines.join("\n"), {
    mode: 0o600,
  });

  const credentialKeys = [
    "ANTHROPIC_API_KEY",
    "ELIZAOS_CLOUD_API_KEY",
    "ELIZAOS_CLOUD_EMBEDDING_API_KEY",
    "OPENAI_API_KEY",
    "FAL_API_KEY",
    "E2B_API_KEY",
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "NPM_TOKEN",
    "NODE_AUTH_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "DISCORD_BOT_TOKEN",
    "SLACK_BOT_TOKEN",
    "SLACK_APP_TOKEN",
    "SLACK_USER_TOKEN",
    "SLACK_WEBHOOK_URL",
    "SLACK_SIGNING_SECRET",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_APP_SECRET",
    "SIGNAL_CLI_COMMAND",
    "SIGNAL_ACCOUNT_NUMBER",
    "SIGNAL_HTTP_URL",
    "SIGNAL_CLI_PATH",
    "MATRIX_HOMESERVER",
    "MATRIX_ACCESS_TOKEN",
    "EMAIL_SEND_COMMAND",
    "SMS_SEND_COMMAND",
    "MATTERMOST_URL",
    "MATTERMOST_TOKEN",
    "HOMEASSISTANT_URL",
    "HOMEASSISTANT_TOKEN",
    "DINGTALK_WEBHOOK_URL",
    "DINGTALK_ACCESS_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CODE_SETUP_TOKEN",
  ];
  const environment: NodeJS.ProcessEnv = {
    // Deliberately narrow PATH: enough for sh/node/git/ssh, not enough for
    // real codex/claude account CLIs or package-manager side effects.
    PATH: [
      // Keep the node runtime directory so nub can re-exec node.
      ...new Set([
        dirname(process.execPath),
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
      ]),
    ].join(":"),
    HOME: home,
    USERPROFILE: home,
    TERM: "xterm-256color",
    TMPDIR: tmpdir(),
    DOOLITTLE_REPO_ROOT: root,
    DOOLITTLE_WORKSPACE_DIR: root,
    DOOLITTLE_DATA_DIR: data,
    DOOLITTLE_MODE: "cli",
    DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
    DOOLITTLE_USE_LINKED_CODEX_AUTH: "false",
    DOOLITTLE_USE_LINKED_CLAUDE_CODE_AUTH: "false",
    ELIZA_HOME: data,
    ELIZA_STATE_DIR: data,
    ELIZA_VAULT_DISABLE_KEYCHAIN: "1",
    ELIZA_CONFIG_PATH: join(data, "eliza.json"),
    ELIZA_ACP_STATE_DIR: join(data, "plugin-acp"),
    ELIZA_ACCOUNT_POOL_KEEPALIVE: "false",
    ...Object.fromEntries(credentialKeys.map((key) => [key, ""])),
    ...(options.environment ?? {}),
  };

  let cleaned = false;
  return {
    root,
    home,
    data,
    environment,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export interface WizardSession {
  fixture: WizardFixture;
  terminal: TerminalSession;
}

/** Spawn the fullscreen setup wizard inside a real PTY against the fixture. */
export function spawnWizardSession(options: {
  fixture?: WizardFixture;
  cols?: number;
  rows?: number;
  args?: string[];
  environment?: NodeJS.ProcessEnv;
}): WizardSession {
  const fixture = options.fixture ?? createWizardFixture();
  const terminal = spawnTerminalSession({
    command: resolveNubExecutable(),
    argv: [bootstrapEntry, ...(options.args ?? [])],
    cols: options.cols ?? 110,
    rows: options.rows ?? 30,
    cwd: fixture.root,
    env: {
      ...fixture.environment,
      ...(options.environment ?? {}),
    },
  });
  return { fixture, terminal };
}

/**
 * Send a real X10 mouse press then release at one-based terminal
 * coordinates, separated like a human click. Blessed's mouse parser handles
 * one sequence per data chunk, so press and release must not be combined
 * into a single write.
 */
export async function clickTerminal(
  terminal: TerminalSession,
  x: number,
  y: number,
  pauseMs = 90,
): Promise<void> {
  const x10 = (button: number) =>
    `\x1b[M${String.fromCharCode(32 + button)}${String.fromCharCode(32 + x)}${String.fromCharCode(32 + y)}`;
  terminal.type(x10(0));
  await sleep(pauseMs);
  terminal.type(x10(3));
  await sleep(180);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}
