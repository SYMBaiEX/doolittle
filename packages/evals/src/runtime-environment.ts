import { isAbsolute, join, resolve } from "node:path";
import { resolveManagedDirectories } from "@doolittle/agent/config/env/directories";
import { parseEnv } from "@doolittle/agent/config/env/schema";

interface EvalRuntimeEnvironmentOptions {
  repoRoot: string;
  root: string;
  mode: "cli" | "api";
  workspaceDir?: string;
  baseEnvironment?: NodeJS.ProcessEnv;
}

/** Transient runtime state must never fall back to the operator's shared state. */
export function assertEvalRuntimeEnvironment(
  environment: NodeJS.ProcessEnv,
  options: EvalRuntimeEnvironmentOptions,
): void {
  const parsed = parseEnv(environment);
  const directories = resolveManagedDirectories(options.repoRoot, parsed);
  const expected = {
    dataDir: join(options.root, "data"),
    gatewayDataDir: join(options.root, "gateway"),
    hooksDir: join(options.root, "hooks"),
    workspaceDir: options.workspaceDir ?? join(options.root, "workspace"),
  };
  for (const [key, value] of Object.entries(expected)) {
    if (directories[key as keyof typeof expected] !== resolve(value)) {
      throw new Error(`Evaluation runtime isolation preflight failed: ${key}.`);
    }
  }
  // The SDK ACP store and account helpers do not use Doolittle's directory
  // resolver. Without these explicit overrides they reuse the operator's
  // global task/session history even when all Doolittle directories are fresh.
  const sdkState = {
    ELIZA_ACP_STATE_DIR: join(options.root, "acp"),
    ACP_AUDIT_LOG_PATH: join(options.root, "acp", "audit.ndjson"),
    ELIZA_HOME: expected.dataDir,
    PGLITE_DATA_DIR: join(expected.dataDir, "pglite"),
  };
  for (const [key, value] of Object.entries(sdkState)) {
    if (environment[key] !== value) {
      throw new Error(`Evaluation SDK state preflight failed: ${key}.`);
    }
  }
  if (environment.POSTGRES_URL?.trim() || environment.DATABASE_URL?.trim()) {
    throw new Error("Evaluation database isolation preflight failed.");
  }
  if (
    environment.DOOLITTLE_MODE !== options.mode ||
    environment.DOOLITTLE_REPO_ROOT !== options.repoRoot ||
    environment.DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE !== "true" ||
    environment.ELIZAOS_CLOUD_ENABLED !== "false" ||
    parsed.DOOLITTLE_USE_LINKED_CODEX_AUTH !==
      ((options.baseEnvironment?.DOOLITTLE_USE_LINKED_CODEX_AUTH ?? "true") ===
        "true")
  ) {
    throw new Error("Evaluation runtime capture/mode preflight failed.");
  }
}

/**
 * Uses the same schema/resolver as the actual runtime, not plausible shorthand
 * environment names. It does not write state, start services or export secrets.
 * Configured credentials remain volatile; research is a separate explicit opt-in.
 */
export function createEvalRuntimeEnvironment(
  options: EvalRuntimeEnvironmentOptions,
): NodeJS.ProcessEnv {
  if (
    !isAbsolute(options.root) ||
    !isAbsolute(options.repoRoot) ||
    (options.workspaceDir && !isAbsolute(options.workspaceDir))
  ) {
    throw new Error("Evaluation runtime roots must be absolute.");
  }
  const environment: NodeJS.ProcessEnv = {
    ...(options.baseEnvironment ?? process.env),
    DOOLITTLE_REPO_ROOT: options.repoRoot,
    DOOLITTLE_MODE: options.mode,
    DOOLITTLE_DATA_DIR: join(options.root, "data"),
    DOOLITTLE_GATEWAY_DATA_DIR: join(options.root, "gateway"),
    DOOLITTLE_HOOKS_DIR: join(options.root, "hooks"),
    ELIZA_ACP_STATE_DIR: join(options.root, "acp"),
    ACP_AUDIT_LOG_PATH: join(options.root, "acp", "audit.ndjson"),
    ELIZA_HOME: join(options.root, "data"),
    PGLITE_DATA_DIR: join(options.root, "data", "pglite"),
    // Empty values shadow repo dotenv inputs (override:false), so an inherited
    // database URL cannot redirect an evaluation into shared or remote SQL.
    POSTGRES_URL: "",
    DATABASE_URL: "",
    DOOLITTLE_WORKSPACE_DIR:
      options.workspaceDir ?? join(options.root, "workspace"),
    DOOLITTLE_USE_LINKED_CODEX_AUTH:
      options.baseEnvironment?.DOOLITTLE_USE_LINKED_CODEX_AUTH ?? "true",
    DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE: "true",
    ELIZAOS_CLOUD_ENABLED: "false",
  };
  delete environment.ELIZAOS_CLOUD_API_KEY;
  delete environment.ELIZA_CLOUD_API_KEY;
  if (options.mode === "api") {
    environment.ELIZA_API_BIND = "127.0.0.1";
    environment.ELIZA_API_PORT = "0";
  }
  assertEvalRuntimeEnvironment(environment, options);
  return environment;
}
