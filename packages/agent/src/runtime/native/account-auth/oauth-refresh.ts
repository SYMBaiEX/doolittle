import { trimTextOrUndefined } from "./token-loaders";

export const DEFAULT_OAUTH_REFRESH_TIMEOUT_MS = 10_000;

export interface OAuthRefreshRequest {
  tokenUrl: string;
  clientId: string;
  refreshToken: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  throwOnFailure?: boolean;
  failureMessage?: (status: number, detail: string) => string;
}

export interface OAuthRefreshResult {
  accessToken: string;
  refreshToken: string;
  rawPayload?: Record<string, unknown>;
}

export async function refreshOAuthCredentials(
  request: OAuthRefreshRequest,
): Promise<OAuthRefreshResult | undefined> {
  let response: Response;
  try {
    response = await fetch(request.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(request.headers ?? {}),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: request.refreshToken,
        client_id: request.clientId,
      }),
      signal: AbortSignal.timeout(
        request.timeoutMs ?? DEFAULT_OAUTH_REFRESH_TIMEOUT_MS,
      ),
    });
  } catch (error) {
    if (request.throwOnFailure) {
      throw new Error(
        `OAuth refresh request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
    return undefined;
  }

  if (!response.ok) {
    const detail = await response.text();
    if (request.throwOnFailure) {
      const fallbackMessage = `OAuth refresh failed (${response.status}): ${detail}`;
      throw new Error(
        request.failureMessage?.(response.status, detail) ?? fallbackMessage,
      );
    }
    return undefined;
  }

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    [key: string]: unknown;
  };
  const accessToken = trimTextOrUndefined(payload.access_token);
  if (!accessToken) {
    return undefined;
  }

  return {
    accessToken,
    refreshToken:
      trimTextOrUndefined(payload.refresh_token) || request.refreshToken,
    rawPayload: payload as Record<string, unknown>,
  };
}
