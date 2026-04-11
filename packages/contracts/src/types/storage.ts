import { homedir } from "node:os";
import { join } from "node:path";

export interface PluginStorageOptions {
  dataRoot: string;
}

export interface PluginStorageBinding {
  dataRoot: string;
  scope: string;
  rootDir: string;
}

export interface RuntimeStoragePaths {
  rootDir: string;
  dataDir: string;
}

export interface RuntimeStorageProvider {
  paths(): RuntimeStoragePaths;
  resolveDataPath(...segments: string[]): string;
}

function defaultPluginDataRoot(): string {
  const configured = process.env.DOOLITTLE_DATA_DIR?.trim();
  return configured
    ? join(configured, "plugins")
    : join(homedir(), ".doolittle", "plugins");
}

export function bindPluginStorage(
  scope: string,
  options?: PluginStorageOptions,
): PluginStorageBinding {
  const dataRoot = options?.dataRoot?.trim() || defaultPluginDataRoot();
  return {
    dataRoot,
    scope,
    rootDir: join(dataRoot, scope),
  };
}
