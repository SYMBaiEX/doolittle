import { hasTokenCredentials } from "./credentials";

export function trimTextOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readNestedField(
  payload: unknown,
  path: string[],
): Record<string, unknown> | undefined {
  let current: unknown = payload;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (!current || typeof current !== "object") {
    return undefined;
  }
  return current as Record<string, unknown>;
}

export function readTokenPair(
  payload: unknown,
  accessTokenField: string,
  refreshTokenField: string,
): { accessToken?: string; refreshToken?: string } {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const record = payload as Record<string, unknown>;
  return {
    accessToken: trimTextOrUndefined(record[accessTokenField]),
    refreshToken: trimTextOrUndefined(record[refreshTokenField]),
  };
}

export function readNestedTokenPair(
  payload: unknown,
  path: string[],
  accessTokenField: string,
  refreshTokenField: string,
): { accessToken?: string; refreshToken?: string } {
  return readTokenPair(
    readNestedField(payload, path),
    accessTokenField,
    refreshTokenField,
  );
}

export function readTokenField(
  payload: unknown,
  field: string,
): string | undefined {
  return trimTextOrUndefined(
    (payload as Record<string, unknown> | undefined)?.[field],
  );
}

export function hasTokens(
  credentials: { accessToken?: string; refreshToken?: string } | undefined,
): boolean {
  return hasTokenCredentials(credentials);
}
