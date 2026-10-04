import { syncElizaEnvAliases } from "@elizaos/shared";
import type { EnvConfig } from "@/types/runtime";
import { stageLegacyApiAliases } from "./aliases";
import { buildEnvConfig } from "./build";
import {
  prepareManagedDirectories,
  resolveManagedDirectories,
} from "./directories";
import { loadProcessEnv } from "./load";
import { getDefaultRepoRoot } from "./paths";
import { parseEnv } from "./schema";

const repoRoot = getDefaultRepoRoot();

// Worker processes receive only their approved settings from the desktop
// host. Import-time dotenv would silently reintroduce every host credential.
if (process.env.DOOLITTLE_BOT_RUNTIME !== "worker") loadProcessEnv(repoRoot);

// Preserve the original Doolittle names as input-only compatibility aliases;
// Eliza's canonical environment becomes authoritative after this boundary.
stageLegacyApiAliases(process.env);
syncElizaEnvAliases({ brandedPrefix: "DOOLITTLE" });

export function loadConfig(): EnvConfig {
  const values = parseEnv(process.env);
  const directories = prepareManagedDirectories(
    resolveManagedDirectories(repoRoot, values),
  );

  return buildEnvConfig(values, directories);
}
