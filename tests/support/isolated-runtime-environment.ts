import { isAbsolute, join, parse } from "node:path";

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
    HOME: runtimeDir,
    USERPROFILE: runtimeDir,
    APPDATA: join(runtimeDir, "appdata"),
    LOCALAPPDATA: join(runtimeDir, "local-appdata"),
    DOOLITTLE_DATA_DIR: runtimeDir,
    ELIZA_HOME: runtimeDir,
    ELIZA_CONFIG_PATH: join(runtimeDir, "eliza.json"),
    ELIZA_ACP_STATE_DIR: join(runtimeDir, "plugin-acp"),
    ACP_AUDIT_LOG_PATH: join(runtimeDir, "plugin-acp", "audit.ndjson"),
    DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
    DOOLITTLE_USE_LINKED_DEVIN_AUTH: "false",
    ELIZA_ACCOUNT_POOL_KEEPALIVE: "false",
  };
}
