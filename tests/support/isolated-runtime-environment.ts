import { execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { delimiter, dirname, isAbsolute, join, parse } from "node:path";

const fixtureVaultKey = randomBytes(32);

const UTF8_LOCALE_CANDIDATES = ["C.UTF-8", "en_US.UTF-8"] as const;
let detectedUtf8Locale: string | undefined;

function normalizeLocaleName(name: string): string {
  return name.trim().toLowerCase().replace(/-/gu, "");
}

function fallbackUtf8Locale(): string {
  // Older macOS installations do not always expose C.UTF-8, while minimal
  // Linux images often have C.UTF-8 without generated en_US locales.
  return process.platform === "darwin" ? "en_US.UTF-8" : "C.UTF-8";
}

function detectUtf8Locale(): string {
  if (detectedUtf8Locale) return detectedUtf8Locale;
  let availableLocales: string[] = [];
  try {
    availableLocales = execFileSync("locale", ["-a"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).split(/\r?\n/u);
  } catch {
    // Windows and minimal containers may not ship the locale utility. The
    // platform fallback below is still preferable to inheriting POSIX/C.
  }
  for (const candidate of UTF8_LOCALE_CANDIDATES) {
    const normalizedCandidate = normalizeLocaleName(candidate);
    const available = availableLocales.find(
      (name) => normalizeLocaleName(name) === normalizedCandidate,
    );
    if (available) {
      detectedUtf8Locale = available.trim();
      return detectedUtf8Locale;
    }
  }
  detectedUtf8Locale = fallbackUtf8Locale();
  return detectedUtf8Locale;
}

/** Locale pins authoritative over the host for fixture child processes. */
export function utf8LocaleEnvironment(): Pick<
  NodeJS.ProcessEnv,
  "LC_ALL" | "LANG"
> {
  const locale = detectUtf8Locale();
  return { LC_ALL: locale, LANG: locale };
}

export function liveCodexModel() {
  return {
    provider: "codex",
    model: process.env.DOOLITTLE_LIVE_CODEX_MODEL?.trim() || "gpt-6-luna",
    reasoningEffort: "medium",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    maxTokens: 8192,
  };
}

// Explicit empty values prevent dotenv's override:false from activating a
// connector whose credentials were absent from the parent process environment.
const OFFLINE_CREDENTIAL_AND_CONNECTOR_KEYS = [
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
  "TELEGRAM_API_ROOT",
  "TELEGRAM_ALLOWED_CHATS",
  "DISCORD_BOT_TOKEN",
  "DISCORD_APPLICATION_ID",
  "SLACK_BOT_TOKEN",
  "SLACK_APP_TOKEN",
  "SLACK_USER_TOKEN",
  "SLACK_WEBHOOK_URL",
  "SLACK_SIGNING_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
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
] as const;

/** Pin SDK-owned stores before bootstrap; Electron userData alone is insufficient. */
export function isolatedRuntimeEnvironment(
  runtimeDir: string,
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (!isAbsolute(runtimeDir) || parse(runtimeDir).root === runtimeDir) {
    throw new Error("An owned absolute fixture runtime directory is required.");
  }
  const environment: NodeJS.ProcessEnv = {};
  // Keep only host launch/display essentials, not credentials, database URLs,
  // provider configuration, Node injection flags, or linked account homes.
  for (const key of [
    "PATH",
    "SHELL",
    "LANG",
    "LC_ALL",
    "TERM",
    "DISPLAY",
    "XAUTHORITY",
    "WAYLAND_DISPLAY",
    "XDG_RUNTIME_DIR",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "ComSpec",
    "COMSPEC",
    "PATHEXT",
  ]) {
    if (inherited[key] !== undefined) environment[key] = inherited[key];
  }
  for (const key of OFFLINE_CREDENTIAL_AND_CONNECTOR_KEYS) {
    environment[key] = "";
  }
  return {
    ...environment,
    // Host LC_ALL/LANG are launch details, not credentials, but POSIX/C leaks
    // change unicode width and terminal rendering. Pin UTF-8 deterministically.
    ...utf8LocaleEnvironment(),
    // The fixture's private HOME has no Nub runtime cache. Reuse the trusted
    // Node already executing the tests instead of provisioning it per child.
    PATH: [dirname(process.execPath), environment.PATH]
      .filter(Boolean)
      .join(delimiter),
    HOME: runtimeDir,
    // Linux browser native-transport sockets live under XDG_RUNTIME_DIR. If
    // inherited, every fixture shares the per-user /run/user/<uid> dir and
    // sequential boots collide with EADDRINUSE — macOS never notices because
    // the socket follows the isolated HOME instead.
    XDG_RUNTIME_DIR: runtimeDir,
    USERPROFILE: runtimeDir,
    APPDATA: join(runtimeDir, "appdata"),
    LOCALAPPDATA: join(runtimeDir, "local-appdata"),
    DOOLITTLE_DATA_DIR: runtimeDir,
    ELIZA_HOME: runtimeDir,
    ELIZA_STATE_DIR: runtimeDir,
    ELIZA_VAULT_DISABLE_KEYCHAIN: "1",
    ELIZA_VAULT_PASSPHRASE: createHmac("sha256", fixtureVaultKey)
      .update(runtimeDir)
      .digest("hex"),
    ELIZA_CONFIG_PATH: join(runtimeDir, "eliza.json"),
    ELIZA_ACP_STATE_DIR: join(runtimeDir, "plugin-acp"),
    ACP_AUDIT_LOG_PATH: join(runtimeDir, "plugin-acp", "audit.ndjson"),
    DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
    ELIZA_ACCOUNT_POOL_KEEPALIVE: "false",
  };
}
