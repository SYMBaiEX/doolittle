import type { EnvConfig } from "../../types/runtime/index";
import { buildEnvConfig } from "./build";
import {
  prepareManagedDirectories,
  resolveManagedDirectories,
} from "./directories";
import { applicationEnvRoot, loadApplicationEnv } from "./load";
import { parseEnv } from "./schema";

export { loadApplicationEnv } from "./load";

export function loadConfig(): EnvConfig {
  loadApplicationEnv();
  const values = parseEnv(process.env);
  const directories = prepareManagedDirectories(
    resolveManagedDirectories(applicationEnvRoot, values),
  );

  return buildEnvConfig(values, directories);
}
