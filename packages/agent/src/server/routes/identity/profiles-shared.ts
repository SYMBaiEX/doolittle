import type { AppContext } from "@/runtime/bootstrap";
import type { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import { json } from "@/server/responses";

export type NativeServices = ReturnType<typeof getNativeServices>;

export type IdentityProfileRouteInput = {
  context: AppContext;
  request: Request;
  url: URL;
  nativeServices: NativeServices;
};

export type IdentityProfileRouteHandler = (
  input: IdentityProfileRouteInput,
) => Promise<Response> | Response;

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
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
  return (await request.json()) as T;
}
