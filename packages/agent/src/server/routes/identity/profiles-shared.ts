import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

export type IdentityProfileRouteInput = {
  context: AppContext;
  request: Request;
  url: URL;
};

export type IdentityProfileRouteHandler = (
  input: IdentityProfileRouteInput,
) => Promise<Response> | Response;

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

export class IdentityProfileBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityProfileBodyError";
  }
}

export function getSearchParam(url: URL, name: string): string | null {
  return url.searchParams.get(name);
}

export function getPositiveLimit(
  url: URL,
  name: string,
  fallback: number,
): number {
  const value = Number(url.searchParams.get(name) ?? String(fallback));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new IdentityProfileBodyError("Invalid JSON body");
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new IdentityProfileBodyError("JSON body must be an object");
  }

  return body as T;
}
