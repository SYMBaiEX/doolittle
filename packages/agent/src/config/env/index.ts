import type { EnvConfig } from "@/types/runtime";
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

export function loadConfig(): EnvConfig {
  const values = parseEnv(process.env);
  const directories = prepareManagedDirectories(
    resolveManagedDirectories(repoRoot, values),
  );

  return buildEnvConfig(values, directories);
}
