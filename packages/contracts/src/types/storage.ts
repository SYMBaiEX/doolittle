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
