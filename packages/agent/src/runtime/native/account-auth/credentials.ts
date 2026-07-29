import type {
  LinkedClaudeCodeCredentials,
  LinkedCodexCredentials,
} from "./types";

export type LinkedTokenCredentials =
  | LinkedCodexCredentials
  | LinkedClaudeCodeCredentials
  | {
      accessToken?: string;
      refreshToken?: string;
    };

export function hasTokenCredentials(
  credentials: LinkedTokenCredentials | undefined,
): boolean {
  return Boolean(credentials?.accessToken || credentials?.refreshToken);
}

export function getReusableStoredTokenCredentials<
  TCredentials extends LinkedTokenCredentials,
>(credentials: TCredentials | undefined): TCredentials | undefined {
  return hasTokenCredentials(credentials) ? credentials : undefined;
}

export function persistResolvedTokenCredentials<TCredentials>(
  credentials: TCredentials | undefined,
  persistCredentials: (credentials: TCredentials | undefined) => void,
): TCredentials | undefined {
  persistCredentials(credentials);
  return credentials;
}

export function resolveStoredOrLoadedTokenCredentials<
  TCredentials extends LinkedTokenCredentials,
>({
  stored,
  loaded,
  persistCredentials,
}: {
  stored: TCredentials | undefined;
  loaded: TCredentials | undefined;
  persistCredentials: (credentials: TCredentials | undefined) => void;
}): TCredentials | undefined {
  if (hasTokenCredentials(loaded)) {
    return persistResolvedTokenCredentials(loaded, persistCredentials);
  }
  return getReusableStoredTokenCredentials(stored);
}
