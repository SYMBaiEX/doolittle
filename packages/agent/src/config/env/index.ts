import { syncElizaEnvAliases } from "@elizaos/shared/utils/env";
import type { EnvConfig } from "../../types/runtime/index";
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
let declaresDatabaseUrl: boolean | undefined;

export function loadApplicationEnv(): boolean {
  if (declaresDatabaseUrl !== undefined) return declaresDatabaseUrl;
  // Workers only receive settings approved by the desktop host.
  declaresDatabaseUrl =
    process.env.DOOLITTLE_BOT_RUNTIME !== "worker" &&
    loadProcessEnv(repoRoot).declaresDatabaseUrl;
  stageLegacyApiAliases(process.env);
  syncElizaEnvAliases({ brandedPrefix: "DOOLITTLE" });
  return declaresDatabaseUrl;
}

export function loadConfig(): EnvConfig {
  loadApplicationEnv();
  const values = parseEnv(process.env);
  const directories = prepareManagedDirectories(
    resolveManagedDirectories(repoRoot, values),
  );

  return buildEnvConfig(values, directories);
}
