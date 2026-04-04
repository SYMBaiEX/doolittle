import type { EnvConfig } from "@/types/runtime";
import { buildEnvConfig } from "./env/build";
import {
  prepareManagedDirectories,
  resolveManagedDirectories,
} from "./env/directories";
import { loadProcessEnv } from "./env/load";
import { getDefaultRepoRoot } from "./env/paths";
import { parseEnv } from "./env/schema";

const repoRoot = getDefaultRepoRoot();

loadProcessEnv(repoRoot);

export function loadConfig(): EnvConfig {
  const values = parseEnv(process.env);
  const directories = prepareManagedDirectories(
    resolveManagedDirectories(repoRoot, values),
  );

  return buildEnvConfig(values, directories);
}
