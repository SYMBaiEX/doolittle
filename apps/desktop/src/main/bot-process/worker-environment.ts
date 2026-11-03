import { resolve } from "node:path";
import type { BotDefinition } from "@doolittle/contracts/bots";
import type { ProviderGrant } from "./provider-connections";

export function buildBotWorkerEnvironment(
  definition: BotDefinition,
  botDataDir: string,
  grant: ProviderGrant,
  launchEnvironment: NodeJS.ProcessEnv | undefined,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    PATH: source.PATH,
    LANG: source.LANG,
    LC_ALL: source.LC_ALL,
    TMPDIR: source.TMPDIR,
    TEMP: source.TEMP,
    TMP: source.TMP,
    SYSTEMROOT: source.SYSTEMROOT,
    WINDIR: source.WINDIR,
    HOME: botDataDir,
    USERPROFILE: botDataDir,
    ELIZA_HOME: botDataDir,
    ELIZA_STATE_DIR: botDataDir,
    CODEX_HOME: resolve(botDataDir, "codex-home"),
    CLAUDE_CONFIG_DIR: resolve(botDataDir, "claude-config"),
    DOOLITTLE_NAME: definition.name,
    DOOLITTLE_BOT_RUNTIME: "worker",
    DOOLITTLE_BOT_PROFILE: JSON.stringify(definition),
    DOOLITTLE_OFFLINE_BOOTSTRAP:
      definition.model.provider === "offline" ? "true" : "false",
    ...(launchEnvironment?.ELECTRON_RUN_AS_NODE
      ? { ELECTRON_RUN_AS_NODE: launchEnvironment.ELECTRON_RUN_AS_NODE }
      : {}),
  };
  if (grant.kind === "direct") {
    environment[
      grant.provider === "openai-api" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"
    ] = grant.token;
  }
  return environment;
}
