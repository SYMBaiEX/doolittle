/**
 * Decode an opaque route identifier without allowing malformed escapes or
 * path-like values to reach persistence-backed services.
 */
export function parseOpaqueRouteId(
  rawId: string | undefined,
): string | undefined {
  if (!rawId) return undefined;
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    return undefined;
  }

  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(id) ? id : undefined;
}
