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

loadProcessEnv(repoRoot);

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
