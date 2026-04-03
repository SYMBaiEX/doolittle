import type { PluginStorageOptions } from "@doolittle/contracts";

export interface AutocoderPluginOptions {
  terminal: {
    run(command: string, timeoutMs?: number): Promise<unknown>;
  };
  repository: {
    isRepository(): boolean;
    status(): Promise<string>;
    diffStat(): Promise<string>;
    recentCommits(limit?: number): Promise<string>;
  };
  workspace: {
    rootDir(): string;
  };
  storage?: PluginStorageOptions;
}

export interface SecretStore {
  secrets: Record<string, string>;
}
