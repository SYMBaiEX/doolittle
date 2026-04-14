import {
  commandExists,
  DEFAULT_REFRESH_SKEW_SECONDS,
  decodeJwtPayload,
  isUnixMillisecondsExpiring,
  isUnixSecondsExpiring,
  readCommandJson,
  readCommandText,
  readJson,
  resolveHome,
  writeJson,
} from "./shared";
import { persistProviderCredentials as persistStoredProviderCredentials } from "./store";
import type { LinkedProviderName } from "./types";

export interface TokenProviderAuthDependencies<TCredentials> {
  defaultRefreshSkewSeconds: number;
  resolveHome(homePath?: string): string;
  readEnv(name: string): string | undefined;
  commandExists(command: string): boolean;
  readCommandText(command: string, args: string[], homePath?: string): string;
  readCommandJson(command: string, args: string[], homePath?: string): unknown;
  readJson(path: string): unknown;
  writeJson(path: string, value: unknown): void;
  getStoredCredentials(): TCredentials | undefined;
  persistCredentials(credentials: TCredentials | undefined): void;
  decodeJwtPayload(token?: string): Record<string, unknown> | undefined;
  isUnixSecondsExpiring(
    expiresAtSeconds?: number,
    skewSeconds?: number,
  ): boolean;
  isUnixMillisecondsExpiring(
    expiresAtMs?: number,
    skewSeconds?: number,
  ): boolean;
}

export function createTokenProviderAuthDependencies<TCredentials>(
  provider: LinkedProviderName,
  getStoredCredentials: () => TCredentials | undefined,
): TokenProviderAuthDependencies<TCredentials> {
  return {
    defaultRefreshSkewSeconds: DEFAULT_REFRESH_SKEW_SECONDS,
    resolveHome,
    readEnv: (name) => process.env[name],
    commandExists,
    readCommandText,
    readCommandJson,
    readJson,
    writeJson,
    getStoredCredentials,
    persistCredentials: (credentials) =>
      persistStoredProviderCredentials(provider, credentials as never),
    decodeJwtPayload,
    isUnixSecondsExpiring,
    isUnixMillisecondsExpiring,
  };
}
