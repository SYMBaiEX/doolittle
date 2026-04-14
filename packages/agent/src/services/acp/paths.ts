import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AcpServicePaths } from "./types";

export function createAcpServicePaths(dataDir: string): AcpServicePaths {
  const registryDir = join(dataDir, "acp");
  const registryPath = join(registryDir, "agent.json");
  const exportDir = join(registryDir, "exports");
  const importDir = join(registryDir, "imports");
  const rootPackagePath = join(import.meta.dir, "../../../../package.json");

  mkdirSync(registryDir, { recursive: true });
  mkdirSync(exportDir, { recursive: true });
  mkdirSync(importDir, { recursive: true });

  return {
    registryDir,
    registryPath,
    exportDir,
    importDir,
    rootPackagePath,
  };
}
