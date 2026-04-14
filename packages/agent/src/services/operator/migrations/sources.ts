import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { EnvConfig } from "@/types";
import type { MigrationSourceSummary } from "./types";

export function getMigrationSources(
  config: EnvConfig,
): MigrationSourceSummary[] {
  const openClawPath = join(homedir(), ".openclaw");
  return [
    {
      id: "openclaw",
      label: "OpenClaw home",
      path: openClawPath,
      exists: existsSync(openClawPath),
    },
    {
      id: "workspace",
      label: "Current workspace",
      path: config.workspaceDir,
      exists: existsSync(config.workspaceDir),
    },
  ];
}
