import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { readRegularFileSync } from "@doolittle/storage";
import { syncElizaEnvAliases } from "@elizaos/shared/utils/env";
import { parse, populate } from "dotenv";
import { stageLegacyApiAliases } from "./aliases";
import { getDefaultRepoRoot } from "./paths";

const MAX_REPO_ENV_BYTES = 256 * 1024;
const UNSAFE_ENV_ERROR = "Unable to read application .env safely.";

export interface LoadProcessEnvDependencies {
  env?: NodeJS.ProcessEnv;
}

export function resolveRepoEnvPath(repoRoot: string): string {
  return resolve(repoRoot, ".env");
}

export function loadProcessEnv(
  repoRoot: string,
  dependencies: LoadProcessEnvDependencies = {},
) {
  const env = dependencies.env ?? process.env;
  const repoEnvPath = resolveRepoEnvPath(repoRoot);

  // Only a missing application-root file is benign. A present but unsafe file
  // must fail before any parsed values can reach the process environment.
  try {
    lstatSync(repoEnvPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { declaresDatabaseUrl: false };
    }
    throw new Error(UNSAFE_ENV_ERROR);
  }

  let contents: Buffer;
  try {
    contents = readRegularFileSync(repoEnvPath, MAX_REPO_ENV_BYTES, {
      singleLink: true,
    });
  } catch {
    throw new Error(UNSAFE_ENV_ERROR);
  }

  const parsed = parse(contents);
  populate(env, parsed, { override: false });
  return {
    declaresDatabaseUrl:
      Object.hasOwn(parsed, "DATABASE_URL") ||
      Object.hasOwn(parsed, "POSTGRES_URL"),
  };
}

// Capture the application root before loading values from its environment file.
export const applicationEnvRoot = getDefaultRepoRoot();
let declaresDatabaseUrl: boolean | undefined;

export function loadApplicationEnv({ reload = false } = {}): boolean {
  if (!reload && declaresDatabaseUrl !== undefined) return declaresDatabaseUrl;
  // Workers only receive settings approved by the desktop host.
  declaresDatabaseUrl =
    process.env.DOOLITTLE_BOT_RUNTIME !== "worker" &&
    loadProcessEnv(applicationEnvRoot).declaresDatabaseUrl;
  stageLegacyApiAliases(process.env);
  syncElizaEnvAliases({ brandedPrefix: "DOOLITTLE" });
  return declaresDatabaseUrl;
}
